import type { CalendarInvite } from "./types";

// RFC 5545 iCalendar for one appointment. Hand-rolled — a single VEVENT.
export function buildIcs(invite: CalendarInvite): string {
  const method = invite.method ?? "REQUEST";
  const isCancel = method === "CANCEL";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Bright Smile Clinic//Booking//EN",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:${invite.uid}`,
    `SEQUENCE:${invite.sequence ?? 0}`,
    `DTSTAMP:${toIcsUtc(new Date())}`,
    `DTSTART:${toIcsFloating(invite.start)}`,
    `DTEND:${toIcsFloating(invite.end)}`,
    `SUMMARY:${escapeText(invite.summary)}`,
    `DESCRIPTION:${escapeText(invite.description)}`,
    `ORGANIZER;CN=${escapeText(invite.organizer.name)}:mailto:${invite.organizer.email}`,
    ...invite.attendees.map(
      (a) => `ATTENDEE;CN=${escapeText(a.name)};RSVP=TRUE:mailto:${a.email}`,
    ),
    "LOCATION:Bright Smile Clinic",
    `STATUS:${isCancel ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}

function toIcsUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

// Floating (no Z) wall-clock, so "9:00" shows as 9:00 in any viewer's calendar.
// A multi-timezone deploy would anchor to the clinic's zone via VTIMEZONE + TZID.
function toIcsFloating(d: Date): string {
  return toIcsUtc(d).replace(/Z$/, "");
}

function escapeText(value: string): string {
  return value.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
}
