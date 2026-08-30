import { describe, expect, it } from "vitest";
import { CLINIC, enumerateSlotStarts, isSlotStart } from "@server/domain/booking/rules";

// The clinic runs on Asia/Kathmandu in the demo, which is UTC+05:45 — an offset
// with a 45-minute component, and the reason this bug was visible rather than
// subtle. A patient asked for 9am; the model wrote that hour as 09:00Z, which is
// 14:45 in Kathmandu, and the booking went through because 14:45 is inside
// opening hours. Nothing checked it against the times the clinic actually
// offers, and 14:45 is not one of them.
const KATHMANDU = "Asia/Kathmandu";
const iso = (s: string) => new Date(s);

describe("isSlotStart", () => {
  it("accepts every time the clinic offers", () => {
    const day = iso("2026-08-31T06:00:00Z"); // a Monday, mid-morning there
    for (const start of enumerateSlotStarts(day, 60, KATHMANDU)) {
      expect(isSlotStart(start, 60, KATHMANDU)).toBe(true);
    }
  });

  // The exact failure: 09:00Z is 14:45 clinic time, inside opening hours and
  // off the half-hour grid, so only a grid check can reject it.
  it("rejects a UTC hour mistaken for a clinic hour", () => {
    const wrong = iso("2026-08-31T09:00:00Z"); // 14:45 in Kathmandu
    expect(isSlotStart(wrong, 60, KATHMANDU)).toBe(false);
  });

  it("accepts the instant that really is 9am at the clinic", () => {
    const right = iso("2026-08-31T03:15:00Z"); // 09:00 in Kathmandu
    expect(isSlotStart(right, 60, KATHMANDU)).toBe(true);
  });

  it("rejects a time that no longer leaves room to finish", () => {
    // 16:30 local starts inside hours but a 60-minute service ends at 17:30.
    const tooLate = iso("2026-08-31T10:45:00Z"); // 16:30 in Kathmandu
    expect(isSlotStart(tooLate, 60, KATHMANDU)).toBe(false);
    expect(isSlotStart(tooLate, 30, KATHMANDU)).toBe(true);
  });

  it("rejects a weekend entirely", () => {
    const saturday = iso("2026-08-29T03:15:00Z");
    expect(isSlotStart(saturday, 60, KATHMANDU)).toBe(false);
  });

  it("holds for the clinic's own configured zone", () => {
    const day = new Date();
    const starts = enumerateSlotStarts(day, 60, CLINIC.timeZone);
    for (const start of starts) expect(isSlotStart(start, 60, CLINIC.timeZone)).toBe(true);
  });
});
