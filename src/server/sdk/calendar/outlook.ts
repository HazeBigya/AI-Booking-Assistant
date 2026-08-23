// Outlook / Microsoft 365 provider — stub. Real impl: POST
// /me/calendar/getSchedule for isBusy, POST /me/events for createEvent. No-op
// here; DB is source of truth. Shows the seam accepts more than one vendor.

import type { CalendarProvider, CalendarEvent } from "./types";

export const outlookCalendar: CalendarProvider = {
  async isBusy(_professionalId: number, _start: Date, _end: Date): Promise<boolean> {
    return false;
  },
  async createEvent(_event: CalendarEvent): Promise<string> {
    return "outlook-stub-event";
  },
};
