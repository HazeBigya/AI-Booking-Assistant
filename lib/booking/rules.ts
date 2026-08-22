// =============================================================================
// Pure business rules. No AI, no DB, no framework imports — just policy + math.
//
// TIMEZONE SIMPLIFICATION: we treat the DB's UTC clock as the clinic's local
// clock. i.e. "09:00 clinic time" == 09:00 UTC. This keeps the take-home free
// of timezone-conversion bugs. All the *UTC* date methods below encode that.
// =============================================================================

export type ProfessionalLevel = "junior" | "senior";

export const CLINIC = {
  openHour: 9, // 09:00
  closeHour: 17, // 17:00
  slotGranularityMin: 30, // appointments start on a :00 or :30 grid
  workingDays: [1, 2, 3, 4, 5], // Mon–Fri. JS getUTCDay(): 0=Sun … 6=Sat
} as const;

// Capability policy. The DB's professional_services table is the SOURCE OF
// TRUTH; this mirror lets the scheduler reject an impossible request cheaply
// (and lets us unit-test the rule without a database).
export const SERVICE_CODES_BY_LEVEL: Record<ProfessionalLevel, readonly string[]> = {
  junior: ["A", "B"],
  senior: ["A", "B", "C", "D", "E"],
};

export function canLevelPerform(level: ProfessionalLevel, serviceCode: string): boolean {
  return SERVICE_CODES_BY_LEVEL[level].includes(serviceCode);
}

/** Minutes since UTC midnight — a simple scalar for time-of-day comparisons. */
function minutesIntoDay(d: Date): number {
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

export function isWorkingDay(d: Date): boolean {
  return CLINIC.workingDays.includes(d.getUTCDay() as (typeof CLINIC.workingDays)[number]);
}

/**
 * True only if [start, end] sits inside one working-day clinic window
 * (open ≤ start, end ≤ close, same UTC calendar day).
 */
export function isWithinClinicHours(start: Date, end: Date): boolean {
  if (!isWorkingDay(start)) return false;
  // Reject appointments that straddle midnight into another day.
  const sameDay =
    start.getUTCFullYear() === end.getUTCFullYear() &&
    start.getUTCMonth() === end.getUTCMonth() &&
    start.getUTCDate() === end.getUTCDate();
  if (!sameDay) return false;

  const open = CLINIC.openHour * 60;
  const close = CLINIC.closeHour * 60;
  return minutesIntoDay(start) >= open && minutesIntoDay(end) <= close;
}

/**
 * All valid grid start times on the given day for an appointment of
 * `durationMin`, such that the appointment finishes by closing time.
 * Returns [] on non-working days.
 *
 * `day` may be any Date on the target day; only its UTC calendar date is used.
 */
export function enumerateSlotStarts(day: Date, durationMin: number): Date[] {
  if (!isWorkingDay(day)) return [];

  const starts: Date[] = [];
  const open = CLINIC.openHour * 60;
  const close = CLINIC.closeHour * 60;

  for (let m = open; m + durationMin <= close; m += CLINIC.slotGranularityMin) {
    const start = new Date(
      Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 0, 0, 0, 0),
    );
    start.setUTCMinutes(m);
    starts.push(start);
  }
  return starts;
}

/** Convenience: the end time of an appointment. */
export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}
