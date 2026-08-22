// =============================================================================
// Google Calendar provider — STUB.
//
// In a real build this would use the Google Calendar API (OAuth2 service
// account or delegated user token) to check free/busy and create events:
//   - isBusy   -> calendar.freebusy.query for the professional's calendar
//   - createEvent -> calendar.events.insert on that calendar
//
// It is intentionally a no-op here: the take-home's source of truth is the
// Postgres bookings table, and OAuth setup is out of scope. It exists to prove
// the seam — a real provider drops in behind CalendarProvider with zero changes
// to lib/booking.
// =============================================================================

import type { CalendarProvider, CalendarEvent } from "./types";

export const googleCalendar: CalendarProvider = {
  async isBusy(_professionalId: number, _start: Date, _end: Date): Promise<boolean> {
    // TODO(real): calendar.freebusy.query. DB is source of truth for now.
    return false;
  },
  async createEvent(_event: CalendarEvent): Promise<string> {
    // TODO(real): calendar.events.insert -> return the created event id.
    return "google-stub-event";
  },
};
