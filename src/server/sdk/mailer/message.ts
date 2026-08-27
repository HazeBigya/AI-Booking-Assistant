import { CLINIC } from "@server/domain/booking/rules";
import { formatZonedDate, formatZonedTime } from "@server/domain/booking/timezone";
import type { CalendarInvite } from "./types";

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

// The .ics alone is unreadable in an inbox — a person needs to see what was
// booked without opening an attachment. Times are rendered in clinic time, the
// zone named explicitly so a patient abroad is not left guessing.
export function renderInviteEmail(invite: CalendarInvite): RenderedEmail {
  const cancelled = invite.method === "CANCEL";
  const date = formatZonedDate(invite.start, CLINIC.timeZone);
  const time = `${formatZonedTime(invite.start, CLINIC.timeZone)} – ${formatZonedTime(invite.end, CLINIC.timeZone)}`;
  const minutes = Math.round((invite.end.getTime() - invite.start.getTime()) / 60_000);
  const patient = invite.attendees[0]?.name;

  const rows: [string, string][] = [
    ["Appointment", invite.summary],
    ["Date", date],
    ["Time", `${time} (${CLINIC.timeZone.replace(/_/g, " ")})`],
    ["Length", `${minutes} minutes`],
    ["Clinic", invite.organizer.name],
  ];

  const heading = cancelled ? "Your appointment is cancelled" : "Your appointment is confirmed";
  const opening = cancelled
    ? `${patient ? `Hi ${patient}, ` : ""}we've cancelled the appointment below. Nothing further is needed — the slot is back in the diary.`
    : `${patient ? `Hi ${patient}, ` : ""}you're booked in. The details are below, and the attached invitation will add it to your calendar.`;
  const closing = cancelled
    ? "If this was a mistake, just message us and we'll rebook you."
    : "Need to change it? Message us any time and we'll move it.";

  const text = [
    heading.toUpperCase(),
    "",
    opening,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    closing,
    invite.organizer.name,
  ].join("\n");

  const html = `<div style="margin:0;padding:24px;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#18181b">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:16px;overflow:hidden">
    <div style="padding:24px 28px 8px">
      <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#a1a1aa">${escapeHtml(invite.organizer.name)}</p>
      <h1 style="margin:0;font-size:20px;font-weight:600;letter-spacing:-0.01em;color:${cancelled ? "#9f1239" : "#18181b"}">${escapeHtml(heading)}</h1>
      <p style="margin:12px 0 0;font-size:14px;line-height:1.6;color:#52525b">${escapeHtml(opening)}</p>
    </div>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:20px 0 0;border-collapse:collapse;font-size:14px">
      ${rows
        .map(
          ([k, v]) => `<tr>
        <td style="padding:10px 28px;border-top:1px solid #f4f4f5;color:#a1a1aa;white-space:nowrap">${escapeHtml(k)}</td>
        <td style="padding:10px 28px;border-top:1px solid #f4f4f5;text-align:right;color:#18181b">${escapeHtml(v)}</td>
      </tr>`,
        )
        .join("")}
    </table>
    <div style="padding:20px 28px 26px;border-top:1px solid #f4f4f5">
      <p style="margin:0;font-size:13px;line-height:1.6;color:#71717a">${escapeHtml(closing)}</p>
    </div>
  </div>
</div>`;

  return {
    subject: `${cancelled ? "Cancelled" : "Confirmed"}: ${invite.summary} — ${date}`,
    text,
    html,
  };
}

export function renderOtpEmail(code: string, clinicName: string): RenderedEmail {
  const text = `Your ${clinicName} verification code is ${code}.\n\nIt expires in 10 minutes. If you didn't ask for this, you can ignore this email.`;
  const html = `<div style="margin:0;padding:24px;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#18181b">
  <div style="max-width:420px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:16px;padding:28px;text-align:center">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#a1a1aa">${escapeHtml(clinicName)}</p>
    <h1 style="margin:0 0 18px;font-size:18px;font-weight:600;letter-spacing:-0.01em">Your verification code</h1>
    <p style="margin:0;font-size:34px;font-weight:600;letter-spacing:0.18em;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${escapeHtml(code)}</p>
    <p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:#71717a">Expires in 10 minutes. If you didn't ask for this, ignore this email.</p>
  </div>
</div>`;
  return { subject: `${code} is your ${clinicName} code`, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
