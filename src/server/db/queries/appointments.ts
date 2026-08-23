// Read-only: a patient's own booked appointments (grounds "show my bookings").
import { and, asc, eq } from "drizzle-orm";
import { db } from "../client";
import { bookings, professionals, services } from "../schema";

export interface PatientAppointment {
  service: string;
  dentist: string;
  title: string;
  start: Date;
  end: Date;
  status: string;
}

export async function getAppointmentsForPatient(email: string): Promise<PatientAppointment[]> {
  return db
    .select({
      service: services.name,
      dentist: professionals.name,
      title: professionals.title,
      start: bookings.startTime,
      end: bookings.endTime,
      status: bookings.status,
    })
    .from(bookings)
    .innerJoin(professionals, eq(professionals.id, bookings.professionalId))
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .where(and(eq(bookings.patientEmail, email), eq(bookings.status, "booked")))
    .orderBy(asc(bookings.startTime));
}
