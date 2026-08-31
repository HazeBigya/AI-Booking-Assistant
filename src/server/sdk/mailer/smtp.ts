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

// "Bright Smile Clinic <a@b.com>" -> "a@b.com"; a bare address is returned as is.
export function addressOf(from: string): string {
  return (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase();
}

// A From the server has not been authorised to use is not refused loudly. Gmail
// rewrites the header back to the authenticated account, so the mail arrives
// looking like it came from the developer's personal address and nothing
// anywhere reports a problem — the setting appears to work and simply has no
// effect. Other hosts reject with a 5.7.x that names neither variable.
//
// Warned rather than thrown, because the mismatch is legitimate once the
// address is a verified alias or a domain the host is authorised for, and
// refusing to start would break the setup this is meant to help.
export function warnIfFromIsUnauthorised(from: string, user: string): string | undefined {
  if (addressOf(from) === addressOf(user)) return undefined;
  return (
    `[mail] MAIL_FROM is <${addressOf(from)}> but SMTP_USER is <${user}>. ` +
    `Mail will be sent as ${user} unless that address is a verified alias on the account ` +
    `(Gmail: Settings -> Accounts -> "Send mail as"). The display name works either way, ` +
    `so "Clinic Name <${user}>" is usually what was wanted.`
  );
}

// Any SMTP host. Sends to arbitrary recipients without owning a domain.
export function createSmtpMailer(cfg: SmtpConfig): Mailer {
  const unauthorised = warnIfFromIsUnauthorised(cfg.from, cfg.user);
  if (unauthorised) console.warn(unauthorised);

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
