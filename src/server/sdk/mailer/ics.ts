import type { CalendarInvite } from "./types";

// Builds an RFC 5545 iCalendar REQUEST for one appointment. Kept small and
// hand-rolled (no dependency) — a single VEVENT is well within reach.
export function buildIcs(invite: CalendarInvite): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Bright Smile Clinic//Booking//EN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${invite.uid}`,
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
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}

// iCalendar UTC timestamp: YYYYMMDDTHHMMSSZ (for DTSTAMP).
function toIcsUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

// Floating (no Z) wall-clock: YYYYMMDDTHHMMSS. We store times as UTC-treated-as-
// clinic-local, so emitting them floating makes "9:00" show as 9:00 in any
// viewer's calendar. A real multi-timezone deploy would anchor to the clinic's
// IANA zone with a VTIMEZONE + TZID instead.
function toIcsFloating(d: Date): string {
  return toIcsUtc(d).replace(/Z$/, "");
}

function escapeText(value: string): string {
  return value.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
}
