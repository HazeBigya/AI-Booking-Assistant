import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "../client";
import { bookings } from "../schema";
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

export async function insertBooking(b: NewBooking): Promise<Booking> {
  try {
    const rows = await db
      .insert(bookings)
      .values({
        professionalId: b.professionalId,
        serviceId: b.serviceId,
        startTime: b.start,
        endTime: b.end,
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
