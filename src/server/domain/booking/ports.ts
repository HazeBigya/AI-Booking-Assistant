// Interfaces declared BY the core, implemented by the db layer, so the
// dependency arrow points db -> booking and the core stays swappable.

import type { Interval } from "./availability";
import type { ProfessionalLevel } from "./rules";

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
  // When the row was created. Part of the calendar UID: the id alone resets to 1
  // on a fresh database, and Google keys calendar events on UID forever per
  // account — so a reused id makes a new invite look like an old cancelled one.
  // The creation timestamp differs on every booking, which keeps the UID unique.
  createdAt: Date;
}

// Thrown when the DB exclusion constraint rejects an overlap.
export class DoubleBookingError extends Error {
  constructor(message = "That time was just booked by someone else.") {
    super(message);
    this.name = "DoubleBookingError";
  }
}

export interface BookingRepository {
  listServices(): Promise<Service[]>;
  getServiceByCode(code: string): Promise<Service | null>;
  listProfessionalsForService(serviceId: number): Promise<Professional[]>;
  getBookingsForProfessionalOnDay(professionalId: number, day: Date): Promise<Interval[]>;
  getBookingsForPatientOnDay(patientEmail: string, day: Date): Promise<Interval[]>;
  // MUST throw DoubleBookingError if the exclusion constraint fires.
  insertBooking(booking: NewBooking): Promise<Booking>;
}
