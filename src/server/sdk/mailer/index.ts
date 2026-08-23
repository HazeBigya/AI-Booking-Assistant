import { consoleMailer } from "./console";
import { createResendMailer } from "./resend";
import { createSmtpMailer } from "./smtp";
import type { Mailer } from "./types";

export type { Mailer } from "./types";

let cached: Mailer | undefined;

// Picks the first configured transport: SMTP (Gmail/Brevo/any host) -> Resend ->
// console fallback. So the app runs with no email setup, and real delivery to
// arbitrary recipients is a matter of env vars.
export function getMailer(): Mailer {
  if (cached) return cached;

  if (process.env.SMTP_HOST) {
    cached = createSmtpMailer({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      user: requireEnv("SMTP_USER"),
      pass: requireEnv("SMTP_PASS"),
      from: process.env.MAIL_FROM ?? "Bright Smile Clinic <no-reply@example.com>",
    });
  } else if (process.env.RESEND_API_KEY) {
    cached = createResendMailer(
      process.env.RESEND_API_KEY,
      process.env.MAIL_FROM ?? "onboarding@resend.dev",
    );
  } else {
    cached = consoleMailer;
  }
  return cached;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. See .env.example.`);
  return value;
}
