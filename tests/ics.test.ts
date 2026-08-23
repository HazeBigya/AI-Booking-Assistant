import { describe, it, expect } from "vitest";
import { buildIcs } from "@server/sdk/mailer/ics";

const invite = {
  uid: "booking-1@brightsmile",
  summary: "Teeth Whitening with Kate",
  description: "Your appointment at Bright Smile Clinic.",
  start: new Date("2026-08-24T09:00:00Z"),
  end: new Date("2026-08-24T10:00:00Z"),
  organizer: { name: "Bright Smile Clinic", email: "clinic@example.com" },
  attendees: [
    { name: "Pat", email: "pat@example.com" },
    { name: "Kate", email: "kate@example.com" },
  ],
};

describe("buildIcs", () => {
  it("emits DTSTART/DTEND as floating wall-clock (no Z) so the time doesn't shift", () => {
    const ics = buildIcs(invite);
    expect(ics).toContain("DTSTART:20260824T090000");
    expect(ics).not.toContain("DTSTART:20260824T090000Z");
    expect(ics).toContain("DTEND:20260824T100000");
  });

  it("stamps DTSTAMP in UTC (with Z)", () => {
    expect(buildIcs(invite)).toMatch(/DTSTAMP:\d{8}T\d{6}Z/);
  });

  it("includes both attendees and the organizer", () => {
    const ics = buildIcs(invite);
    expect(ics).toContain("mailto:pat@example.com");
    expect(ics).toContain("mailto:kate@example.com");
    expect(ics).toContain("ORGANIZER;CN=Bright Smile Clinic:mailto:clinic@example.com");
  });

  it("is a single-event REQUEST", () => {
    const ics = buildIcs(invite);
    expect(ics).toContain("METHOD:REQUEST");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");
  });

  it("escapes commas and semicolons in text", () => {
    const ics = buildIcs({ ...invite, summary: "A; B, C" });
    expect(ics).toContain("SUMMARY:A\\; B\\, C");
  });
});
