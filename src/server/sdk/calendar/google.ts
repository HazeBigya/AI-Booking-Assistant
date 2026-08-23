// Google Calendar provider — stub. Real impl: calendar.freebusy.query for
// isBusy, calendar.events.insert for createEvent. No-op here; DB is source of
// truth and OAuth is out of scope. Proves the CalendarProvider seam.

import type { CalendarProvider, CalendarEvent } from "./types";

export const googleCalendar: CalendarProvider = {
  async isBusy(_professionalId: number, _start: Date, _end: Date): Promise<boolean> {
    return false;
  },
  async createEvent(_event: CalendarEvent): Promise<string> {
    return "google-stub-event";
  },
};
