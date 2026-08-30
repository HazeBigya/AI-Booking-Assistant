import { Resend } from "resend";
import { buildIcs } from "./ics";
import { renderInviteEmail, renderOtpEmail } from "./message";
import type { CalendarInvite, Mailer } from "./types";

export function createResendMailer(apiKey: string, from: string): Mailer {
  const resend = new Resend(apiKey);
  return {
    name: "resend",
    async sendOtp(to: string, code: string): Promise<void> {
      const { error } = await resend.emails.send({
        from,
        to,
        ...renderOtpEmail(code, "Bright Smile Clinic"),
      });
      if (error) throw new Error(`Resend failed: ${error.message}`);
    },
    async sendInvite(invite: CalendarInvite): Promise<void> {
      const method = invite.method ?? "REQUEST";
      const cancelled = method === "CANCEL";
      const { error } = await resend.emails.send({
        from,
        to: invite.to.email,
        ...renderInviteEmail(invite),
        attachments: [
          {
            // The method belongs in the content type, not just inside the file:
            // it is what tells a mail client this is a calendar action rather
            // than a document, and which action it is. Without it the same
            // bytes arrive as an unremarkable attachment. nodemailer sets this
            // for the SMTP path via icalEvent; here it is ours to set.
            filename: cancelled ? "cancellation.ics" : "invitation.ics",
            contentType: `text/calendar; charset=utf-8; method=${method}`,
            content: Buffer.from(buildIcs(invite)).toString("base64"),
          },
        ],
      });
      if (error) throw new Error(`Resend failed: ${error.message}`);
    },
  };
}
