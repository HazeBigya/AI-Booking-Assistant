// =============================================================================
// The availability algorithm. PURE: it takes existing bookings as an argument
// and returns free slots. No DB, no AI, no clock reads inside the core logic.
//
// Why pure matters:
//   - Testable with plain arrays in milliseconds (see tests/booking.test.ts).
//   - The AI can NEVER shortcut it — the /lib/ai layer must call this to learn
//     what is free. The model's opinion about availability is irrelevant.
// =============================================================================

import { enumerateSlotStarts, addMinutes } from "./rules";

export interface Interval {
  start: Date;
  end: Date;
}

/**
 * Do two time ranges overlap? Ranges are treated as [start, end) —
 * end-EXCLUSIVE — so two appointments that merely touch at a boundary
 * (a.end === b.start) do NOT overlap.
 *
 * The whole test is one line: A and B overlap iff A starts before B ends
 * AND B starts before A ends. The comparison is strict `<`, not `<=` — that
 * strictness is exactly what makes back-to-back bookings legal, and it mirrors
 * the Postgres `tstzrange(..., '[)')` exclusion constraint in 001_schema.sql.
 *
 * Picture it:
 *   A:      [====)
 *   B:  [====)          -> overlap (B.end after A.start, A.end after B.start)
 *   B:           [====) -> touch, not overlap (B.start == A.end)
 */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Free grid start times on `day` for an appointment of `durationMin`,
 * given the bookings that already exist for ONE professional.
 *
 * Strategy:
 *   1. Ask rules.ts for every candidate start on the grid that fits before
 *      closing time (this already filters out non-working days).
 *   2. Keep a candidate only if its [start, start+duration) interval overlaps
 *      none of the existing bookings.
 */
export function computeAvailableSlots(params: {
  day: Date;
  durationMin: number;
  existingBookings: Interval[];
}): Date[] {
  const { day, durationMin, existingBookings } = params;

  return enumerateSlotStarts(day, durationMin).filter((start) => {
    const candidate: Interval = { start, end: addMinutes(start, durationMin) };
    // `.some` short-circuits on the first conflict — a free slot only survives
    // if NONE of the existing bookings overlap it.
    return !existingBookings.some((booking) => overlaps(candidate, booking));
  });
}
