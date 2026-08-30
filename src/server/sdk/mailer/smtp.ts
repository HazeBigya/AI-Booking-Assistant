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

// Any SMTP host. Sends to arbitrary recipients without owning a domain.
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
