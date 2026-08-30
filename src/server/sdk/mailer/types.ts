// Mailer seam: swap console -> SMTP -> Resend without touching callers.

export interface CalendarInvite {
  uid: string;
  summary: string;
  description: string;
  start: Date;
  end: Date;
  organizer: { name: string; email: string };
  // Who the mail is delivered to. Only the patient: the seeded dentists are
  // fictional, and mailing an invented address achieves nothing but a bounce.
  to: { name: string; email: string };
  // Who the event is *for*, which is not the same question. Both parties belong
  // in the .ics — an invite naming only one side of an appointment is wrong even
  // when only one side receives it — and a real deployment would reach the
  // dentist through their own calendar rather than their inbox.
  attendees: { name: string; email: string }[];
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
