// Clinic hours are wall-clock rules ("we open at 9"), so every check below runs
// in the clinic's zone. Instants stay UTC everywhere; only the reading is zoned.

import { partsInZone, sameZonedDay, zonedTimeToUtc } from "./timezone";

export type ProfessionalLevel = "junior" | "senior";

export const CLINIC = {
  openHour: 9,
  closeHour: 17,
  slotGranularityMin: 30,
  workingDays: [1, 2, 3, 4, 5], // Mon–Fri; 0=Sun … 6=Sat
  // Blank CLINIC_TIMEZONE falls back to the machine's zone; start.sh passes the
  // host's in, since containers run UTC. Tests pin it in vitest.config.ts.
  timeZone: process.env.CLINIC_TIMEZONE?.trim() || hostTimeZone(),
} as const;

function hostTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

// professional_services is the source of truth; this mirror lets the scheduler
// reject impossible requests cheaply and keeps the rule unit-testable.
export const SERVICE_CODES_BY_LEVEL: Record<ProfessionalLevel, readonly string[]> = {
  junior: ["A", "B"],
  senior: ["A", "B", "C", "D", "E"],
};

export function canLevelPerform(level: ProfessionalLevel, serviceCode: string): boolean {
  return SERVICE_CODES_BY_LEVEL[level].includes(serviceCode);
}

export function isWorkingDay(d: Date, timeZone: string = CLINIC.timeZone): boolean {
  const { weekday } = partsInZone(d, timeZone);
  return (CLINIC.workingDays as readonly number[]).includes(weekday);
}

export function isWithinClinicHours(
  start: Date,
  end: Date,
  timeZone: string = CLINIC.timeZone,
): boolean {
  if (!isWorkingDay(start, timeZone)) return false;
  if (!sameZonedDay(start, end, timeZone)) return false;

  const s = partsInZone(start, timeZone);
  const e = partsInZone(end, timeZone);
  const open = CLINIC.openHour * 60;
  const close = CLINIC.closeHour * 60;
  return s.hour * 60 + s.minute >= open && e.hour * 60 + e.minute <= close;
}

// Grid starts on `day` for an appointment that finishes by close; [] on
// non-working days. Returns instants, one per clinic-local grid time.
export function enumerateSlotStarts(
  day: Date,
  durationMin: number,
  timeZone: string = CLINIC.timeZone,
): Date[] {
  if (!isWorkingDay(day, timeZone)) return [];

  const { year, month, day: dayOfMonth } = partsInZone(day, timeZone);
  const starts: Date[] = [];
  const open = CLINIC.openHour * 60;
  const close = CLINIC.closeHour * 60;

  for (let m = open; m + durationMin <= close; m += CLINIC.slotGranularityMin) {
    starts.push(
      zonedTimeToUtc(
        { year, month, day: dayOfMonth, hour: Math.floor(m / 60), minute: m % 60 },
        timeZone,
      ),
    );
  }
  return starts;
}

export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}
