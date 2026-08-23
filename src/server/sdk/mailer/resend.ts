import { Resend } from "resend";
import { buildIcs } from "./ics";
import type { CalendarInvite, Mailer } from "./types";

export function createResendMailer(apiKey: string, from: string): Mailer {
  const resend = new Resend(apiKey);
  return {
    name: "resend",
    async sendOtp(to: string, code: string): Promise<void> {
      const { error } = await resend.emails.send({
        from,
        to,
        subject: "Your Bright Smile Clinic login code",
        text: `Your login code is ${code}. It expires in 10 minutes.`,
      });
      if (error) throw new Error(`Resend failed: ${error.message}`);
    },
    async sendInvite(invite: CalendarInvite): Promise<void> {
      const { error } = await resend.emails.send({
        from,
        to: invite.attendees.map((a) => a.email),
        subject: invite.summary,
        text: invite.description,
        attachments: [
          { filename: "invite.ics", content: Buffer.from(buildIcs(invite)).toString("base64") },
        ],
      });
      if (error) throw new Error(`Resend failed: ${error.message}`);
    },
  };
}
