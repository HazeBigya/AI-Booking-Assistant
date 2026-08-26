import { enumerateSlotStarts, addMinutes, CLINIC } from "./rules";

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
  // Injected, not read, to keep this pure. Drops slots that already started:
  // at 1:03 PM the clinic can still offer 1:30 PM, not 9:00 AM.
  now?: Date;
  timeZone?: string;
}): Date[] {
  const {
    day,
    durationMin,
    existingBookings,
    now,
    timeZone = CLINIC.timeZone,
  } = params;

  return enumerateSlotStarts(day, durationMin, timeZone).filter((start) => {
    if (now && start.getTime() <= now.getTime()) return false;
    const candidate: Interval = { start, end: addMinutes(start, durationMin) };
    return !existingBookings.some((booking) => overlaps(candidate, booking));
  });
}
