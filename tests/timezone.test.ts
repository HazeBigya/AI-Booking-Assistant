import { describe, expect, it } from "vitest";
import {
  formatZonedTime,
  partsInZone,
  sameWallClock,
  sameZonedDay,
  zonedDateKey,
  zonedTimeToUtc,
} from "../src/server/domain/booking/timezone";
import {
  enumerateSlotStarts,
  isWithinClinicHours,
  isWorkingDay,
} from "../src/server/domain/booking/rules";
import { computeAvailableSlots } from "../src/server/domain/booking/availability";
import { parseTimeZone } from "../src/server/controllers/chat-controller";

const KATHMANDU = "Asia/Kathmandu"; // UTC+5:45, no daylight saving
const NEW_YORK = "America/New_York"; // UTC-4 in summer, UTC-5 in winter

describe("zoned wall-clock conversion", () => {
  it("resolves a clinic-local time to the right instant in a :45 offset zone", () => {
    const instant = zonedTimeToUtc(
      { year: 2026, month: 8, day: 26, hour: 9, minute: 0 },
      KATHMANDU,
    );
    expect(instant.toISOString()).toBe("2026-08-26T03:15:00.000Z");
  });

  it("round-trips: the instant reads back as the wall-clock time asked for", () => {
    const instant = zonedTimeToUtc(
      { year: 2026, month: 8, day: 26, hour: 16, minute: 30 },
      KATHMANDU,
    );
    const parts = partsInZone(instant, KATHMANDU);
    expect([parts.hour, parts.minute]).toEqual([16, 30]);
  });

  it("applies the offset in force on the date, not a fixed one (DST)", () => {
    // Same wall-clock hour, opposite sides of a daylight-saving change.
    const summer = zonedTimeToUtc({ year: 2026, month: 7, day: 1, hour: 9 }, NEW_YORK);
    const winter = zonedTimeToUtc({ year: 2026, month: 1, day: 5, hour: 9 }, NEW_YORK);
    expect(summer.toISOString()).toBe("2026-07-01T13:00:00.000Z"); // EDT, UTC-4
    expect(winter.toISOString()).toBe("2026-01-05T14:00:00.000Z"); // EST, UTC-5
  });

  it("reports the clinic's calendar day, which can differ from the UTC day", () => {
    const lateEvening = new Date("2026-08-26T19:00:00Z"); // 00:45 on the 27th in Kathmandu
    expect(zonedDateKey(lateEvening, KATHMANDU)).toBe("2026-08-27");
    expect(zonedDateKey(lateEvening, "UTC")).toBe("2026-08-26");
    expect(sameZonedDay(lateEvening, new Date("2026-08-26T03:15:00Z"), KATHMANDU)).toBe(false);
  });

  it("formats times on the clinic clock", () => {
    expect(formatZonedTime(new Date("2026-08-26T03:15:00Z"), KATHMANDU)).toBe("9:00 AM");
  });
});

describe("clinic rules in a non-UTC zone", () => {
  const day = zonedTimeToUtc({ year: 2026, month: 8, day: 26, hour: 12 }, KATHMANDU); // Wednesday

  it("enumerates the grid on the clinic clock, not the UTC clock", () => {
    const starts = enumerateSlotStarts(day, 60, KATHMANDU);
    expect(starts[0].toISOString()).toBe("2026-08-26T03:15:00.000Z"); // 09:00 local
    expect(formatZonedTime(starts[0], KATHMANDU)).toBe("9:00 AM");
    expect(formatZonedTime(starts[starts.length - 1], KATHMANDU)).toBe("4:00 PM");
  });

  it("judges opening hours and working days on the clinic clock", () => {
    const nineLocal = zonedTimeToUtc({ year: 2026, month: 8, day: 26, hour: 9 }, KATHMANDU);
    const tenLocal = zonedTimeToUtc({ year: 2026, month: 8, day: 26, hour: 10 }, KATHMANDU);
    expect(isWithinClinicHours(nineLocal, tenLocal, KATHMANDU)).toBe(true);
    // 09:00 UTC is 14:45 local — still open; 03:15 UTC is 09:00 local, but under a
    // UTC reading it would look like the middle of the night.
    expect(
      isWithinClinicHours(
        new Date("2026-08-26T03:15:00Z"),
        new Date("2026-08-26T04:15:00Z"),
        KATHMANDU,
      ),
    ).toBe(true);
    const saturday = zonedTimeToUtc({ year: 2026, month: 8, day: 29, hour: 12 }, KATHMANDU);
    expect(isWorkingDay(saturday, KATHMANDU)).toBe(false);
  });
});

describe("slots already in progress are not offered", () => {
  const day = new Date("2026-08-26T12:00:00Z"); // Wednesday, UTC clinic

  it("drops every start at or before now, and keeps the rest", () => {
    const now = new Date("2026-08-26T13:03:00Z"); // 1:03 PM
    const slots = computeAvailableSlots({
      day,
      durationMin: 60,
      existingBookings: [],
      now,
      timeZone: "UTC",
    });
    const labels = slots.map((s) => formatZonedTime(s, "UTC"));
    expect(labels).not.toContain("1:00 PM");
    expect(labels[0]).toBe("1:30 PM");
    expect(labels[labels.length - 1]).toBe("4:00 PM");
  });

  it("leaves nothing for a long service once its last start has gone", () => {
    // Service E is 360 minutes: the last start that fits before 17:00 is 11:00.
    const now = new Date("2026-08-26T13:03:00Z");
    const slots = computeAvailableSlots({
      day,
      durationMin: 360,
      existingBookings: [],
      now,
      timeZone: "UTC",
    });
    expect(slots).toEqual([]);
  });

  it("still offers the whole day when now is before opening", () => {
    const now = new Date("2026-08-26T06:00:00Z");
    const slots = computeAvailableSlots({
      day,
      durationMin: 60,
      existingBookings: [],
      now,
      timeZone: "UTC",
    });
    expect(slots).toHaveLength(15);
  });
});

describe("the patient's time zone is untrusted client input", () => {
  it("accepts a real IANA zone", () => {
    expect(parseTimeZone({ timeZone: "Europe/London" })).toBe("Europe/London");
  });

  it("ignores a zone the platform does not know", () => {
    expect(parseTimeZone({ timeZone: "Mars/Olympus_Mons" })).toBeUndefined();
  });

  it("ignores junk instead of failing the turn", () => {
    expect(parseTimeZone({ timeZone: "'; DROP TABLE bookings; --" })).toBeUndefined();
    expect(parseTimeZone({ timeZone: 42 })).toBeUndefined();
    expect(parseTimeZone({ timeZone: "  " })).toBeUndefined();
    expect(parseTimeZone({})).toBeUndefined();
    expect(parseTimeZone(null)).toBeUndefined();
  });
});

// Whether to show a second "your local time" is a question about the clock, not
// the zone name. Two names for the same offset must count as the same clock, or
// the patient hears their time quoted back to them identically.
describe("sameWallClock", () => {
  it("is true for identical zones", () => {
    expect(sameWallClock("Asia/Taipei", "Asia/Taipei")).toBe(true);
  });

  it("is true for different names that share an offset", () => {
    // Both are +08:00 year-round (no DST) — same wall clock, different name.
    expect(sameWallClock("Asia/Taipei", "Asia/Singapore")).toBe(true);
  });

  it("is false for genuinely different offsets", () => {
    // Kathmandu is +05:45, Taipei +08:00 — a real second time worth showing.
    expect(sameWallClock("Asia/Kathmandu", "Asia/Taipei")).toBe(false);
  });
});
