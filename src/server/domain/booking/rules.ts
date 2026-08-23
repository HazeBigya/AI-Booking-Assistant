// Timezone simplification: the DB's UTC clock is treated as clinic-local, so
// "09:00 clinic time" == 09:00 UTC. All UTC date methods below encode that.

export type ProfessionalLevel = "junior" | "senior";

export const CLINIC = {
  openHour: 9,
  closeHour: 17,
  slotGranularityMin: 30,
  workingDays: [1, 2, 3, 4, 5], // Mon–Fri; JS getUTCDay(): 0=Sun … 6=Sat
} as const;

// professional_services is the source of truth; this mirror lets the scheduler
// reject impossible requests cheaply and keeps the rule unit-testable.
export const SERVICE_CODES_BY_LEVEL: Record<ProfessionalLevel, readonly string[]> = {
  junior: ["A", "B"],
  senior: ["A", "B", "C", "D", "E"],
};

export function canLevelPerform(level: ProfessionalLevel, serviceCode: string): boolean {
  return SERVICE_CODES_BY_LEVEL[level].includes(serviceCode);
}

function minutesIntoDay(d: Date): number {
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

export function isWorkingDay(d: Date): boolean {
  return CLINIC.workingDays.includes(d.getUTCDay() as (typeof CLINIC.workingDays)[number]);
}

export function isWithinClinicHours(start: Date, end: Date): boolean {
  if (!isWorkingDay(start)) return false;
  const sameDay =
    start.getUTCFullYear() === end.getUTCFullYear() &&
    start.getUTCMonth() === end.getUTCMonth() &&
    start.getUTCDate() === end.getUTCDate();
  if (!sameDay) return false;

  const open = CLINIC.openHour * 60;
  const close = CLINIC.closeHour * 60;
  return minutesIntoDay(start) >= open && minutesIntoDay(end) <= close;
}

// Valid grid starts on `day` for a `durationMin` appointment that finishes by
// close. Only the UTC calendar date of `day` is used; [] on non-working days.
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

export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}
