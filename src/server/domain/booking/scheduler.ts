// Orchestration the AI calls as tools. Deterministic; trusts the model for
// nothing — every rule is re-checked here against the BookingRepository port.

import { computeAvailableSlots, overlaps, type Interval } from "./availability";
import { isWithinClinicHours, addMinutes } from "./rules";
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

// Per-professional free slots for a service on a day. Empty options => nobody
// qualified, or everyone fully booked.
export async function findAvailability(
  repo: BookingRepository,
  input: { serviceCode: string; day: Date },
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
    });
    if (slots.length > 0) options.push({ professional, slots });
  }

  return { service, options };
}

// One dentist's free slots for a service on a day. Backs the check_availability
// tool, after the patient has chosen a specific dentist.
export async function findAvailabilityForProfessional(
  repo: BookingRepository,
  input: { serviceCode: string; professionalId: number; day: Date },
): Promise<
  { service: Service; professional: Professional; slots: Date[] } | { error: string }
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
  const slots = computeAvailableSlots({
    day: input.day,
    durationMin: service.durationMinutes,
    existingBookings,
  });
  return { service, professional, slots };
}

export type BookingResult =
  | { ok: true; booking: Booking }
  | { ok: false; reason: BookingRejectionReason; message: string };

export type BookingRejectionReason =
  | "unknown_service"
  | "outside_hours"
  | "not_qualified"
  | "slot_taken";

export async function createBooking(
  repo: BookingRepository,
  input: {
    serviceCode: string;
    professionalId: number;
    start: Date;
    patientName: string;
    patientEmail: string;
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
    return { ok: true, booking };
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
