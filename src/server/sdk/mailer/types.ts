// Mailer seam — same pattern as the LLM/calendar providers. Swap the adapter
// (console -> SMTP -> Resend) without touching callers.

export interface CalendarInvite {
  uid: string;
  summary: string;
  description: string;
  start: Date;
  end: Date;
  organizer: { name: string; email: string };
  attendees: { name: string; email: string }[]; // patient + dentist
  // REQUEST (new/updated) or CANCEL (retract). Clients match on UID, so a CANCEL
  // with the original UID + a higher sequence removes the event from calendars.
  method?: "REQUEST" | "CANCEL";
  sequence?: number;
}

export interface Mailer {
  readonly name: string;
  sendOtp(to: string, code: string): Promise<void>;
  // Emails an iCalendar (.ics) invite to all attendees — lands on Google /
  // Outlook / Apple / Zoho calendars, no per-vendor API needed.
  sendInvite(invite: CalendarInvite): Promise<void>;
}
