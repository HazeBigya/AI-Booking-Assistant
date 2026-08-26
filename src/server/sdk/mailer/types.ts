// Mailer seam: swap console -> SMTP -> Resend without touching callers.

export interface CalendarInvite {
  uid: string;
  summary: string;
  description: string;
  start: Date;
  end: Date;
  organizer: { name: string; email: string };
  attendees: { name: string; email: string }[]; // patient + dentist
  // Clients match on UID, so a CANCEL with the original UID and a higher
  // sequence removes the event from calendars.
  method?: "REQUEST" | "CANCEL";
  sequence?: number;
}

export interface Mailer {
  readonly name: string;
  sendOtp(to: string, code: string): Promise<void>;
  sendInvite(invite: CalendarInvite): Promise<void>;
}
