import nodemailer from "nodemailer";
import { buildIcs } from "./ics";
import { renderInviteEmail, renderOtpEmail } from "./message";
import type { CalendarInvite, Mailer } from "./types";

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

// Google shows an app password as four groups of four, and it is copied that way
// far more often than not. The spaces are presentation, never part of the
// secret, but they authenticate as a different string — and the failure is a
// bare 535 that reads as a wrong password rather than a formatting detail.
const GOOGLE_APP_PASSWORD = /^[a-z]{4}( [a-z]{4}){3}$/i;

export function normalisePassword(pass: string): string {
  return GOOGLE_APP_PASSWORD.test(pass) ? pass.replace(/ /g, "") : pass;
}

// Any SMTP host. Sends to arbitrary recipients without owning a domain.
export function createSmtpMailer(cfg: SmtpConfig): Mailer {
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465, // 465 = implicit TLS; 587 = STARTTLS
    auth: { user: cfg.user, pass: normalisePassword(cfg.pass) },
  });

  return {
    name: "smtp",
    async sendOtp(to: string, code: string): Promise<void> {
      const mail = renderOtpEmail(code, "Bright Smile Clinic");
      await transport.sendMail({ from: cfg.from, to, ...mail });
    },
    async sendInvite(invite: CalendarInvite): Promise<void> {
      const mail = renderInviteEmail(invite);
      await transport.sendMail({
        from: cfg.from,
        to: invite.to.email,
        ...mail,
        icalEvent: { method: invite.method ?? "REQUEST", content: buildIcs(invite) },
      });
    },
  };
}
