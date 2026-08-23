import nodemailer from "nodemailer";
import { buildIcs } from "./ics";
import type { CalendarInvite, Mailer } from "./types";

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

// Generic SMTP adapter (nodemailer) — works with Gmail, Brevo, or any SMTP host.
// Sends to arbitrary recipients without owning a domain.
export function createSmtpMailer(cfg: SmtpConfig): Mailer {
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465, // 465 = implicit TLS; 587 = STARTTLS
    auth: { user: cfg.user, pass: cfg.pass },
  });

  return {
    name: "smtp",
    async sendOtp(to: string, code: string): Promise<void> {
      await transport.sendMail({
        from: cfg.from,
        to,
        subject: "Your Bright Smile Clinic login code",
        text: `Your login code is ${code}. It expires in 10 minutes.`,
      });
    },
    async sendInvite(invite: CalendarInvite): Promise<void> {
      await transport.sendMail({
        from: cfg.from,
        to: invite.attendees.map((a) => a.email),
        subject: invite.summary,
        text: invite.description,
        // nodemailer sets the correct text/calendar MIME so clients show the invite.
        icalEvent: { method: "REQUEST", content: buildIcs(invite) },
      });
    },
  };
}
