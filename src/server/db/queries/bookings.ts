import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "../client";
import { bookings, patients, professionals, professionalServices, services } from "../schema";
import {
  DoubleBookingError,
  type Booking,
  type Interval,
  type NewBooking,
} from "@server/domain/booking/ports";

// SQLSTATE for exclusion_constraint violation: our no_double_booking guard fired.
const EXCLUSION_VIOLATION = "23P01";

export async function getBookingsForProfessionalOnDay(
  professionalId: number,
  day: Date,
): Promise<Interval[]> {
  // Half-open UTC window [dayStart, nextDay); filter on start_time.
  const dayStart = new Date(day);
  dayStart.setUTCHours(0, 0, 0, 0);
  const nextDay = new Date(dayStart);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);

  const rows = await db
    .select({ start: bookings.startTime, end: bookings.endTime })
    .from(bookings)
    .where(
      and(
        eq(bookings.professionalId, professionalId),
        gte(bookings.startTime, dayStart),
        lt(bookings.startTime, nextDay),
      ),
    )
    .orderBy(bookings.startTime);
  return rows.map((r) => ({ start: r.start, end: r.end }));
}

export async function getBookingsForPatientOnDay(
  patientEmail: string,
  day: Date,
): Promise<Interval[]> {
  const dayStart = new Date(day);
  dayStart.setUTCHours(0, 0, 0, 0);
  const nextDay = new Date(dayStart);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);

  const rows = await db
    .select({ start: bookings.startTime, end: bookings.endTime })
    .from(bookings)
    .where(
      and(
        eq(bookings.patientEmail, patientEmail),
        eq(bookings.status, "booked"),
        gte(bookings.startTime, dayStart),
        lt(bookings.startTime, nextDay),
      ),
    )
    .orderBy(bookings.startTime);
  return rows.map((r) => ({ start: r.start, end: r.end }));
}

export interface CancelledBooking {
  id: number;
  professionalId: number;
  professionalName: string;
  serviceName: string;
  start: Date;
  end: Date;
  patientName: string;
  patientEmail: string;
}

// Soft-cancels one of the patient's OWN still-booked appointments. The ownership
// + state checks live in the WHERE clause: a patient can only cancel a row that
// is theirs and currently 'booked' (prevents IDOR and double-cancel). Soft-cancel
// (not delete) frees the slot — the exclusion constraint is partial on
// status='booked' — while preserving history. Returns null if nothing matched.
export async function cancelBookingForPatient(
  bookingId: number,
  patientEmail: string,
): Promise<CancelledBooking | null> {
  const [row] = await db
    .update(bookings)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(bookings.id, bookingId),
        eq(bookings.patientEmail, patientEmail),
        eq(bookings.status, "booked"),
      ),
    )
    .returning({
      id: bookings.id,
      professionalId: bookings.professionalId,
      serviceId: bookings.serviceId,
      start: bookings.startTime,
      end: bookings.endTime,
      patientName: bookings.patientName,
      patientEmail: bookings.patientEmail,
    });
  if (!row) return null;

  const [prof] = await db
    .select({ name: professionals.name })
    .from(professionals)
    .where(eq(professionals.id, row.professionalId))
    .limit(1);
  const [svc] = await db
    .select({ name: services.name })
    .from(services)
    .where(eq(services.id, row.serviceId))
    .limit(1);

  return {
    id: row.id,
    professionalId: row.professionalId,
    professionalName: prof?.name ?? "your dentist",
    serviceName: svc?.name ?? "appointment",
    start: row.start,
    end: row.end,
    patientName: row.patientName,
    patientEmail: row.patientEmail,
  };
}

export async function insertBooking(b: NewBooking): Promise<Booking> {
  try {
    // Resolve snapshot fields from authoritative tables at persistence time:
    //  - patient_id: the FK for the verified patient (identity is their email).
    //  - price: this dentist's price for this service (override, else base).
    const patientId = await resolvePatientId(b.patientEmail);
    const price = await resolvePrice(b.professionalId, b.serviceId);

    const rows = await db
      .insert(bookings)
      .values({
        patientId,
        professionalId: b.professionalId,
        serviceId: b.serviceId,
        startTime: b.start,
        endTime: b.end,
        price,
        patientName: b.patientName,
        patientEmail: b.patientEmail,
      })
      .returning({ id: bookings.id });
    return { ...b, id: rows[0].id };
  } catch (err: unknown) {
    // Exclusion constraint fired -> convert to the domain error.
    if (isExclusionViolation(err)) throw new DoubleBookingError();
    throw err;
  }
}

// The verified patient row (created at email verification). Nullable-safe: if
// somehow absent, the email snapshot still records who booked.
async function resolvePatientId(email: string): Promise<number | undefined> {
  const rows = await db.select({ id: patients.id }).from(patients).where(eq(patients.email, email)).limit(1);
  return rows[0]?.id;
}

// This dentist's price for this service: their override, else the service base.
async function resolvePrice(professionalId: number, serviceId: number): Promise<number | undefined> {
  const rows = await db
    .select({ override: professionalServices.priceOverride, base: services.basePrice })
    .from(services)
    .leftJoin(
      professionalServices,
      and(eq(professionalServices.serviceId, services.id), eq(professionalServices.professionalId, professionalId)),
    )
    .where(eq(services.id, serviceId))
    .limit(1);
  const row = rows[0];
  if (!row) return undefined;
  return row.override ?? row.base;
}

// Drizzle may wrap the pg error, so check the error and its cause.
function isExclusionViolation(err: unknown): boolean {
  const codeOf = (e: unknown): string | undefined =>
    typeof e === "object" && e !== null && "code" in e
      ? (e as { code?: string }).code
      : undefined;
  return (
    codeOf(err) === EXCLUSION_VIOLATION ||
    codeOf((err as { cause?: unknown } | null)?.cause) === EXCLUSION_VIOLATION
  );
}
