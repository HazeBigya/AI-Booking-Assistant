// Deterministic orchestration: every rule is re-checked here, against the port.

import { computeAvailableSlots, overlaps, type Interval } from "./availability";
import { CLINIC, enumerateSlotStarts, isWithinClinicHours, addMinutes } from "./rules";
import {
  DoubleBookingError,
  type BookingRepository,
  type Booking,
  type Professional,
  type Service,
} from "./ports";

export interface AvailabilityOption {
  professional: Professional;
  slots: Date[];
}

export interface Availability {
  service: Service;
  options: AvailabilityOption[];
}

export function listServices(repo: BookingRepository): Promise<Service[]> {
  return repo.listServices();
}

export async function findAvailability(
  repo: BookingRepository,
  input: { serviceCode: string; day: Date; now?: Date },
): Promise<Availability | { error: string }> {
  const service = await repo.getServiceByCode(input.serviceCode);
  if (!service) return { error: `Unknown service code "${input.serviceCode}".` };

  const professionals = await repo.listProfessionalsForService(service.id);

  const options: AvailabilityOption[] = [];
  for (const professional of professionals) {
    const existingBookings = await repo.getBookingsForProfessionalOnDay(
      professional.id,
      input.day,
    );
    const slots = computeAvailableSlots({
      day: input.day,
      durationMin: service.durationMinutes,
      existingBookings,
      now: input.now,
    });
    if (slots.length > 0) options.push({ professional, slots });
  }

  return { service, options };
}

// Each of these is a different answer to the patient, and getting them mixed up
// makes the bot blame the dentist for the patient's own clash.
export type NoSlotsReason =
  | "closed"
  | "too_late_today"
  | "patient_busy"
  | "fully_booked";

function explainNoSlots(params: {
  day: Date;
  durationMin: number;
  now?: Date;
  timeZone?: string;
  // True when the dentist had free slots and only the patient's own bookings removed them.
  dentistWasFree?: boolean;
}): { reason: NoSlotsReason; note: string } {
  const { day, durationMin, now, timeZone = CLINIC.timeZone, dentistWasFree } = params;
  const gridStarts = enumerateSlotStarts(day, durationMin, timeZone);

  if (gridStarts.length === 0) {
    return {
      reason: "closed",
      note:
        `The clinic is closed that day, or a ${durationMin}-minute appointment ` +
        `cannot finish before closing time. Offer the next working day.`,
    };
  }
  if (now && gridStarts.every((start) => start.getTime() <= now.getTime())) {
    return {
      reason: "too_late_today",
      note:
        `It is already too late in the day: a ${durationMin}-minute appointment ` +
        `can no longer start and finish before the clinic closes. Tell the patient ` +
        `this and offer the next working day — do NOT offer any time today.`,
    };
  }
  if (dentistWasFree) {
    return {
      reason: "patient_busy",
      note:
        `The DENTIST is free, but every remaining ${durationMin}-minute slot overlaps an ` +
        `appointment the PATIENT already has that day. Never say the dentist is booked or ` +
        `fully booked. Say the patient's own day is too full, name the appointment that is ` +
        `in the way, and offer another day or cancelling that appointment to make room.`,
    };
  }
  return {
    reason: "fully_booked",
    note: "That dentist has no free time left on that day. Offer another day or another dentist.",
  };
}

export async function findAvailabilityForProfessional(
  repo: BookingRepository,
  input: {
    serviceCode: string;
    professionalId: number;
    day: Date;
    patientEmail?: string;
    now?: Date;
  },
): Promise<
  | {
      service: Service;
      professional: Professional;
      slots: Date[];
      noSlotsReason?: NoSlotsReason;
      note?: string;
    }
  | { error: string }
> {
  const service = await repo.getServiceByCode(input.serviceCode);
  if (!service) return { error: `Unknown service code "${input.serviceCode}".` };

  const professionals = await repo.listProfessionalsForService(service.id);
  const professional = professionals.find((p) => p.id === input.professionalId);
  if (!professional) {
    return { error: "That professional cannot perform the requested service." };
  }

  const existingBookings = await repo.getBookingsForProfessionalOnDay(
    professional.id,
    input.day,
  );
  // Kept separate from the patient filter below: "the dentist is booked" and "you
  // are booked" are different sentences, and only this tells them apart.
  const dentistSlots = computeAvailableSlots({
    day: input.day,
    durationMin: service.durationMinutes,
    existingBookings,
    now: input.now,
  });
  let slots = dentistSlots;

  if (input.patientEmail) {
    const patientBookings = await repo.getBookingsForPatientOnDay(input.patientEmail, input.day);
    slots = slots.filter((start) => {
      const candidate: Interval = { start, end: addMinutes(start, service.durationMinutes) };
      return !patientBookings.some((b) => overlaps(candidate, b));
    });
  }

  if (slots.length === 0) {
    const { reason, note } = explainNoSlots({
      day: input.day,
      durationMin: service.durationMinutes,
      now: input.now,
      dentistWasFree: dentistSlots.length > 0,
    });
    return { service, professional, slots, noSlotsReason: reason, note };
  }

  return { service, professional, slots };
}

export type BookingResult =
  // Carries the resolved professional + service so confirmations are grounded.
  | { ok: true; booking: Booking; professional: Professional; service: Service }
  | { ok: false; reason: BookingRejectionReason; message: string };

export type BookingRejectionReason =
  | "unknown_service"
  | "in_past"
  | "outside_hours"
  | "not_qualified"
  | "slot_taken"
  | "patient_busy";

export async function createBooking(
  repo: BookingRepository,
  input: {
    serviceCode: string;
    professionalId: number;
    start: Date;
    patientName: string;
    patientEmail: string;
    now?: Date;
  },
): Promise<BookingResult> {
  const service = await repo.getServiceByCode(input.serviceCode);
  if (!service) {
    return {
      ok: false,
      reason: "unknown_service",
      message: `Unknown service code "${input.serviceCode}".`,
    };
  }

  // Checked here as well as at the tool boundary so no caller can bypass it.
  if (input.now && input.start.getTime() <= input.now.getTime()) {
    return {
      ok: false,
      reason: "in_past",
      message: "That time has already passed. Please pick a later time.",
    };
  }

  const end = addMinutes(input.start, service.durationMinutes);

  if (!isWithinClinicHours(input.start, end)) {
    return {
      ok: false,
      reason: "outside_hours",
      message: "That time is outside clinic hours (Mon–Fri, 09:00–17:00).",
    };
  }

  const professionals = await repo.listProfessionalsForService(service.id);
  const professional = professionals.find((p) => p.id === input.professionalId);
  if (!professional) {
    return {
      ok: false,
      reason: "not_qualified",
      message: "That professional cannot perform the requested service.",
    };
  }

  // App-level overlap check: friendly message before hitting the DB.
  const existingBookings = await repo.getBookingsForProfessionalOnDay(
    professional.id,
    input.start,
  );
  const candidate: Interval = { start: input.start, end };
  if (existingBookings.some((b) => overlaps(candidate, b))) {
    return {
      ok: false,
      reason: "slot_taken",
      message: "That slot is already booked. Please pick another time.",
    };
  }

  const patientBookings = await repo.getBookingsForPatientOnDay(input.patientEmail, input.start);
  if (patientBookings.some((b) => overlaps(candidate, b))) {
    return {
      ok: false,
      reason: "patient_busy",
      message: "You already have an appointment that overlaps this time.",
    };
  }

  // The exclusion constraint is the real guarantee under a race: one insert
  // wins, the other throws DoubleBookingError -> same friendly result.
  try {
    const booking = await repo.insertBooking({
      professionalId: professional.id,
      serviceId: service.id,
      start: input.start,
      end,
      patientName: input.patientName,
      patientEmail: input.patientEmail,
    });
    return { ok: true, booking, professional, service };
  } catch (err) {
    if (err instanceof DoubleBookingError) {
      return {
        ok: false,
        reason: "slot_taken",
        message: "That slot was just taken. Please pick another time.",
      };
    }
    throw err; // unexpected — let it bubble up.
  }
}
