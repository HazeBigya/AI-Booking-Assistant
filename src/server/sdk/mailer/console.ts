import type { CalendarInvite, Mailer } from "./types";

// Default when no email provider is configured: print to the server console.
// A legitimate dev fallback so the app runs with zero email setup.
export const consoleMailer: Mailer = {
  name: "console",
  async sendOtp(to: string, code: string): Promise<void> {
    console.log(`[DEV OTP] ${to} -> ${code}`);
  },
  async sendInvite(invite: CalendarInvite): Promise<void> {
    const to = invite.attendees.map((a) => a.email).join(", ");
    const tag = invite.method === "CANCEL" ? "DEV CANCEL" : "DEV INVITE";
    console.log(`[${tag}] ${invite.summary} -> ${to}`);
  },
};
