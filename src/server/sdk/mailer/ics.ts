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
    `DTSTART:${toIcsUtc(invite.start)}`,
    `DTEND:${toIcsUtc(invite.end)}`,
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

// Absolute UTC (trailing Z). We store instants, so we emit instants and let each
// calendar render them in the viewer's zone. Floating time would be read as the
// viewer's own wall clock and shift the appointment.
function toIcsUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeText(value: string): string {
  return value.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
}
