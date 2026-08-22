// =============================================================================
// Orchestration: turn a request into a validated booking.
//
// This is what the AI layer calls as a "tool". It is deterministic and it
// trusts the model for NOTHING — every rule is re-checked here in code:
//   1. the service exists
//   2. the time is inside clinic hours
//   3. the professional is actually allowed to perform the service
//   4. the slot does not overlap an existing booking (app-level check)
//   5. the DB exclusion constraint is the final backstop (step 4 can race)
//
// It depends only on the BookingRepository PORT (ports.ts), never on a concrete
// database — so it is fully testable with an in-memory fake.
// =============================================================================

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

/**
 * For a service on a given day, what can each capable professional offer?
 * Returns per-professional free slots. Empty options => no one can do it that
 * day (either nobody is qualified or everyone is fully booked).
 */
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

// Discriminated union so callers must handle both outcomes explicitly.
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

  // (2) Clinic hours.
  if (!isWithinClinicHours(input.start, end)) {
    return {
      ok: false,
      reason: "outside_hours",
      message: "That time is outside clinic hours (Mon–Fri, 09:00–17:00).",
    };
  }

  // (3) Is THIS professional allowed to perform THIS service?
  const professionals = await repo.listProfessionalsForService(service.id);
  const professional = professionals.find((p) => p.id === input.professionalId);
  if (!professional) {
    return {
      ok: false,
      reason: "not_qualified",
      message: "That professional cannot perform the requested service.",
    };
  }

  // (4) App-level overlap check — for a friendly message before we hit the DB.
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

  // (5) Insert. The DB exclusion constraint is the real guarantee: if two
  // requests raced past check (4), exactly one insert succeeds; the other
  // throws DoubleBookingError, which we convert to the same friendly result.
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
