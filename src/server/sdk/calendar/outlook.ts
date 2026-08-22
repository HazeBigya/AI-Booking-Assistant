// =============================================================================
// Outlook / Microsoft 365 provider — STUB.
//
// A real build would call the Microsoft Graph API:
//   - isBusy   -> POST /me/calendar/getSchedule (free/busy for the professional)
//   - createEvent -> POST /me/events
//
// No-op here for the same reason as google.ts: DB is the source of truth and
// OAuth is out of scope. Present only to show the CalendarProvider seam accepts
// more than one vendor without touching booking logic.
// =============================================================================

import type { CalendarProvider, CalendarEvent } from "./types";

export const outlookCalendar: CalendarProvider = {
  async isBusy(_professionalId: number, _start: Date, _end: Date): Promise<boolean> {
    // TODO(real): POST /me/calendar/getSchedule. DB is source of truth for now.
    return false;
  },
  async createEvent(_event: CalendarEvent): Promise<string> {
    // TODO(real): POST /me/events -> return the created event id.
    return "outlook-stub-event";
  },
};
