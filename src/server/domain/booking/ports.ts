// =============================================================================
// Ports: the interfaces the booking core depends on, defined BY the core.
//
// This is dependency inversion. scheduler.ts needs to read services, list
// professionals, read a professional's bookings, and insert a booking — but it
// must not know or care that those come from Postgres. So the core declares
// this interface, and /lib/db provides a concrete implementation of it.
//
// Result: the dependency arrow points INTO booking (db -> booking), never out.
// That is what lets /lib/booking stay free of any DB or AI import, and lets the
// tests swap in a tiny in-memory fake.
// =============================================================================

import type { Interval } from "./availability";
import type { ProfessionalLevel } from "./rules";

// Re-export so consumers (and tests) can name the port's booking-interval type
// from one place without reaching into availability.ts.
export type { Interval };

export interface Service {
  id: number;
  code: string;
  name: string;
  durationMinutes: number;
}

export interface Professional {
  id: number;
  name: string;
  level: ProfessionalLevel;
}

export interface NewBooking {
  professionalId: number;
  serviceId: number;
  start: Date;
  end: Date;
  patientName: string;
  patientEmail: string;
}

export interface Booking extends NewBooking {
  id: number;
}

/**
 * Thrown by insertBooking() when the DB's exclusion constraint rejects an
 * overlap — i.e. someone grabbed the slot between our check and our insert.
 * The scheduler catches this and turns it into a friendly result.
 */
export class DoubleBookingError extends Error {
  constructor(message = "That time was just booked by someone else.") {
    super(message);
    this.name = "DoubleBookingError";
  }
}

export interface BookingRepository {
  getServiceByCode(code: string): Promise<Service | null>;
  /** Professionals allowed to perform the service (from professional_services). */
  listProfessionalsForService(serviceId: number): Promise<Professional[]>;
  /** Existing bookings for one professional on the UTC calendar day of `day`. */
  getBookingsForProfessionalOnDay(professionalId: number, day: Date): Promise<Interval[]>;
  /** Insert; MUST throw DoubleBookingError if the exclusion constraint fires. */
  insertBooking(booking: NewBooking): Promise<Booking>;
}
