import { describe, it, expect } from "vitest";
import { buildIcs } from "@server/sdk/mailer/ics";
import { zonedTimeToUtc } from "@server/domain/booking/timezone";

const invite = {
  uid: "booking-1@brightsmile",
  summary: "Teeth Whitening with Kate",
  description: "Your appointment at Bright Smile Clinic.",
  start: new Date("2026-08-24T09:00:00Z"),
  end: new Date("2026-08-24T10:00:00Z"),
  organizer: { name: "Bright Smile Clinic", email: "clinic@example.com" },
  // Delivered to the patient; the dentist is an attendee of the event, not a
  // recipient of the mail.
  to: { name: "Pat", email: "pat@example.com" },
  attendees: [
    { name: "Pat", email: "pat@example.com" },
    { name: "Kate", email: "kate@example.com" },
  ],
};

describe("buildIcs", () => {
  it("emits DTSTART/DTEND as absolute UTC so calendars render the right local time", () => {
    const ics = buildIcs(invite);
    expect(ics).toContain("DTSTART:20260824T090000Z");
    expect(ics).toContain("DTEND:20260824T100000Z");
  });

  it("survives a clinic in a non-UTC zone: 9:00 Kathmandu lands at 03:15Z, not 09:00", () => {
    // The regression: floating time wrote 031500 with no zone, so a calendar in
    // Kathmandu read it as 3:15 AM instead of the 9:00 AM that was booked.
    const kathmandu9am = {
      ...invite,
      start: zonedTimeToUtc({ year: 2026, month: 8, day: 27, hour: 9 }, "Asia/Kathmandu"),
      end: zonedTimeToUtc(
        { year: 2026, month: 8, day: 27, hour: 11, minute: 30 },
        "Asia/Kathmandu",
      ),
    };
    const ics = buildIcs(kathmandu9am);
    expect(ics).toContain("DTSTART:20260827T031500Z");
    expect(ics).toContain("DTEND:20260827T054500Z");
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

  // A booking and its later cancellation are told apart by three things, and a
  // client that mishandles one of them shows the wrong event state. Pinned
  // because "both invites arrived as cancellations" is otherwise unfalsifiable
  // from the code: this is what leaves the building.
  it("marks a new booking as a request for a confirmed event", () => {
    const ics = buildIcs(invite);
    expect(ics).toContain("METHOD:REQUEST");
    expect(ics).toContain("STATUS:CONFIRMED");
    expect(ics).toContain("SEQUENCE:0");
    expect(ics).not.toContain("CANCEL");
  });

  it("marks a cancellation as one, at a higher sequence", () => {
    const ics = buildIcs({ ...invite, method: "CANCEL", sequence: 1 });
    expect(ics).toContain("METHOD:CANCEL");
    expect(ics).toContain("STATUS:CANCELLED");
    expect(ics).toContain("SEQUENCE:1");
  });

  // Clients match on UID, so a cancellation only removes the event it names.
  // Sharing a UID between two bookings would let one cancel the other.
  it("keeps a cancellation tied to the booking it belongs to", () => {
    const cancel = buildIcs({ ...invite, uid: "booking-1@brightsmile", method: "CANCEL" });
    const other = buildIcs({ ...invite, uid: "booking-2@brightsmile" });
    expect(cancel).toContain("UID:booking-1@brightsmile");
    expect(other).toContain("UID:booking-2@brightsmile");
    expect(other).toContain("STATUS:CONFIRMED");
  });
});
