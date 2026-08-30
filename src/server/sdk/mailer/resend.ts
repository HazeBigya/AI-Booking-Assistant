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
      const { error } = await resend.emails.send({
        from,
        to: invite.to.email,
        ...renderInviteEmail(invite),
        attachments: [
          { filename: "invite.ics", content: Buffer.from(buildIcs(invite)).toString("base64") },
        ],
      });
      if (error) throw new Error(`Resend failed: ${error.message}`);
    },
  };
}
