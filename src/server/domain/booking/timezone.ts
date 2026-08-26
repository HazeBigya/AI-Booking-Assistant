// Instants (stored UTC) <-> wall-clock time in an IANA zone. Built on Intl so
// daylight-saving comes from the platform's tz database, not a fixed offset.

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  minute: number;
  weekday: number; // 0=Sun … 6=Sat, matching Date#getUTCDay()
}

const WEEKDAY_ORDER = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Intl.DateTimeFormat construction is expensive; the same few zones repeat.
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(key: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  let cached = formatterCache.get(key);
  if (!cached) {
    cached = new Intl.DateTimeFormat("en-US", options);
    formatterCache.set(key, cached);
  }
  return cached;
}

export function partsInZone(at: Date, timeZone: string): ZonedParts {
  const parts = formatter(`parts:${timeZone}`, {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  }).formatToParts(at);

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";

  // Some ICU versions render midnight as hour "24" under hour12:false.
  const hour = Number(value("hour")) % 24;

  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    hour,
    minute: Number(value("minute")),
    weekday: WEEKDAY_ORDER.indexOf(value("weekday")),
  };
}

function offsetMsAt(at: Date, timeZone: string): number {
  const p = partsInZone(at, timeZone);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return asIfUtc - Math.floor(at.getTime() / 60_000) * 60_000;
}

// Two passes settle DST boundaries, where the offset that applies depends on the
// very instant being solved for.
export function zonedTimeToUtc(
  wall: { year: number; month: number; day: number; hour?: number; minute?: number },
  timeZone: string,
): Date {
  const { year, month, day, hour = 0, minute = 0 } = wall;
  const naive = Date.UTC(year, month - 1, day, hour, minute);

  let instant = naive;
  for (let pass = 0; pass < 2; pass++) {
    const corrected = naive - offsetMsAt(new Date(instant), timeZone);
    if (corrected === instant) break;
    instant = corrected;
  }
  return new Date(instant);
}

export function zonedDateKey(at: Date, timeZone: string): string {
  const { year, month, day } = partsInZone(at, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function sameZonedDay(a: Date, b: Date, timeZone: string): boolean {
  return zonedDateKey(a, timeZone) === zonedDateKey(b, timeZone);
}

// Formatted server-side so the model never does timezone arithmetic on an ISO
// string — it gets that wrong.
export function formatZonedTime(at: Date, timeZone: string): string {
  return formatter(`time:${timeZone}`, {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(at);
}

export function formatZonedDate(at: Date, timeZone: string): string {
  return formatter(`date:${timeZone}`, {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(at);
}
