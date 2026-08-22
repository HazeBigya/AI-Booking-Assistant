// =============================================================================
// The calendar SEAM.
//
// Real clinics sync bookings to an external calendar (Google, Outlook) and may
// treat "busy" blocks there as unavailable. That is a whole OAuth + API project
// on its own, out of scope for this take-home. But we still want to show WHERE
// it would plug in — so we define the interface here and ship no-op stubs.
//
// The Postgres bookings table stays the single source of truth for
// availability. A provider is an OPTIONAL extra check / side effect layered on
// top, swappable without touching lib/booking. That is the point of the seam:
// booking logic depends on this small interface, not on any calendar vendor.
// =============================================================================

export interface CalendarEvent {
  professionalId: number;
  start: Date;
  end: Date;
  patientName: string;
}

export interface CalendarProvider {
  /** Is the professional already busy in [start, end) per the external calendar? */
  isBusy(professionalId: number, start: Date, end: Date): Promise<boolean>;
  /** Mirror a confirmed booking into the external calendar. Returns an event id. */
  createEvent(event: CalendarEvent): Promise<string>;
}

// Default provider: does nothing. DB remains the source of truth. Wiring the
// booking flow to THIS means real providers can be dropped in later with no
// change to callers.
export const noopCalendar: CalendarProvider = {
  async isBusy(): Promise<boolean> {
    return false;
  },
  async createEvent(): Promise<string> {
    return "noop-event";
  },
};
