import { enumerateSlotStarts, addMinutes } from "./rules";

export interface Interval {
  start: Date;
  end: Date;
}

// Ranges are [start, end) — end-exclusive — so back-to-back bookings (a.end ===
// b.start) do not overlap. Strict `<` mirrors the Postgres tstzrange '[)'
// exclusion constraint in 001_schema.sql.
export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

export function computeAvailableSlots(params: {
  day: Date;
  durationMin: number;
  existingBookings: Interval[];
}): Date[] {
  const { day, durationMin, existingBookings } = params;

  return enumerateSlotStarts(day, durationMin).filter((start) => {
    const candidate: Interval = { start, end: addMinutes(start, durationMin) };
    return !existingBookings.some((booking) => overlaps(candidate, booking));
  });
}
