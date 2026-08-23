// Calendar seam. The DB stays the single source of truth for availability; a
// provider is an optional side-effect/extra check, swappable without touching
// the booking core. Ships with a no-op default.

export interface CalendarEvent {
  professionalId: number;
  start: Date;
  end: Date;
  patientName: string;
}

export interface CalendarProvider {
  isBusy(professionalId: number, start: Date, end: Date): Promise<boolean>;
  createEvent(event: CalendarEvent): Promise<string>;
}

export const noopCalendar: CalendarProvider = {
  async isBusy(): Promise<boolean> {
    return false;
  },
  async createEvent(): Promise<string> {
    return "noop-event";
  },
};
