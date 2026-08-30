import { consoleMailer } from "./console";
import { createResendMailer } from "./resend";
import { createSmtpMailer } from "./smtp";
import type { Mailer } from "./types";

export type { Mailer } from "./types";

let cached: Mailer | undefined;

// The address mail comes from. The display name matters more than it looks:
// without it a patient gets a login code from "onboarding@resend.dev", which
// reads like something to delete rather than a code to type.
const DEFAULT_FROM = "Bright Smile Clinic <onboarding@resend.dev>";

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
      from: process.env.MAIL_FROM ?? DEFAULT_FROM,
    });
  } else if (process.env.RESEND_API_KEY) {
    cached = createResendMailer(process.env.RESEND_API_KEY, process.env.MAIL_FROM ?? DEFAULT_FROM);
  } else {
    cached = consoleMailer;
  }
  // Say which one won. SMTP takes precedence over Resend, so a leftover
  // SMTP_HOST silently beats a key someone has just added — and the only
  // symptom is mail arriving from the wrong place, or not at all.
  console.log(`[mail] using ${cached.name}`);
  return cached;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. See .env.example.`);
  return value;
}
