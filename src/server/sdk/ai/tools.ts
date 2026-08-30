import { z } from "zod";
import type { ToolDef } from "./providers";
import { getProfessionalsForServiceByCode, getServiceCatalog } from "@server/db/queries/catalog";
import { getProfessionalContact } from "@server/db/queries/professionals";
import { getAppointmentsForPatient } from "@server/db/queries/appointments";
import { cancelBookingForPatient } from "@server/db/queries/bookings";
import { pgBookingRepository } from "@server/db/queries";
import { createBooking, findAvailabilityForProfessional } from "@server/domain/booking/scheduler";
import { CLINIC, addMinutes } from "@server/domain/booking/rules";
import {
  formatZonedDate,
  formatZonedTime,
  sameZonedDay,
  zonedTimeToUtc,
} from "@server/domain/booking/timezone";
import { createOtp, verifyOtp } from "@server/auth/otp";
import { findOrCreatePatient } from "@server/auth/patients";
import { getMailer } from "@server/sdk/mailer";
import { rateLimit } from "@server/shared/rate-limit";

const OTP_WINDOW_MS = 10 * 60_000;
const OTP_REQUEST_MAX = 3;
const OTP_VERIFY_MAX = 5;

// Descriptions guide the model; the JSON Schema constrains the arguments.
export const toolDefs: ToolDef[] = [
  {
    name: "list_services",
    description: "List all dental services the clinic offers, with prices and durations.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_professionals_for_service",
    description:
      "List the dentists who can perform a service, with their expertise and price for it.",
    parameters: {
      type: "object",
      properties: {
        serviceName: { type: "string", description: "The service name, e.g. 'Root Canal'." },
      },
      required: ["serviceName"],
    },
  },
  {
    name: "check_availability",
    description:
      "Get one dentist's open appointment slots for a service on a given day. Pass the service " +
      "and dentist by NAME exactly as the patient said them. When asked about a SPECIFIC " +
      "dentist you MUST call this for THAT dentist; the result echoes which professional it " +
      "is for, so check that it matches who was asked about. Never say a dentist is " +
      "unavailable unless this returned an empty 'slots' list — if it returns slots, that " +
      "dentist IS available, so never substitute another. Slots are already filtered for you: " +
      "times that have passed, and times the logged-in patient is busy, are removed. If " +
      "'slots' is empty, 'noSlotsReason' says which of four different answers applies " +
      "(closed / too_late_today / patient_busy / fully_booked) and 'note' tells you how to " +
      "say it. Relay THAT reason: patient_busy means the DENTIST is free and the patient's " +
      "own appointments are the clash, so never call the dentist booked in that case.",
    parameters: {
      type: "object",
      properties: {
        serviceName: { type: "string", description: "The service name, e.g. 'Routine Checkup'." },
        dentistName: { type: "string", description: "The dentist's name, e.g. 'John'." },
        day: { type: "string", description: "The day, as YYYY-MM-DD." },
      },
      required: ["serviceName", "dentistName", "day"],
    },
  },
  {
    name: "request_login_code",
    description:
      "Send a 6-digit verification code to the patient's email. Call this once you have " +
      "their email, before booking or showing their appointments.",
    parameters: {
      type: "object",
      properties: { email: { type: "string", description: "The patient's email." } },
      required: ["email"],
    },
  },
  {
    name: "verify_login_code",
    description:
      "Verify the 6-digit code the patient received. On success they are logged in for the " +
      "rest of the conversation. You never judge the code yourself — this tool checks it.",
    parameters: {
      type: "object",
      properties: {
        email: { type: "string", description: "The patient's email." },
        code: { type: "string", description: "The 6-digit code the patient typed." },
      },
      required: ["email", "code"],
    },
  },
  {
    name: "get_my_appointments",
    description:
      "The logged-in patient's own appointments, already separated into `upcoming` and " +
      "`past` — each with the dentist and ready clinic-local date/time labels. No arguments; " +
      "identity comes from the verified session. Requires the patient to be logged in. " +
      "Never claim you cannot see past appointments: this returns them. " +
      "Lead with `upcoming`, which is what someone asking about their appointments almost " +
      "always means. Do not read `past` out unless they asked about it — say how many there " +
      "are and offer them. Never merge the two lists: a visit last week and a booking " +
      "tomorrow are not the same kind of thing, and running them together makes the patient " +
      "work out which is which.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "create_booking",
    description:
      "Book an appointment for the logged-in patient. Requires the patient to be verified " +
      "(via request_login_code + verify_login_code) first; the email comes from the session, so " +
      "you supply only their name. Pass the service and dentist by NAME exactly as the patient " +
      "asked — never ids or codes. The backend resolves the names and rejects an unknown one, " +
      "so never guess and never substitute a different dentist. Do NOT judge time conflicts " +
      "yourself: appointments are end-exclusive (9-10 and 10-11 do NOT clash) and this tool " +
      "rejects genuine clashes — call it and report what it returns rather than refusing on " +
      "your own arithmetic. On success the result carries 'confirmed' with the details to read " +
      "back; on failure 'confirmed' is null and you must tell the patient plainly that it did " +
      "NOT go through, with the reason given.",
    parameters: {
      type: "object",
      properties: {
        serviceName: {
          type: "string",
          description: "The service name, e.g. 'Root Canal' or 'Teeth Whitening'.",
        },
        dentistName: {
          type: "string",
          description: "The dentist's name exactly as the patient requested, e.g. 'John'.",
        },
        start: { type: "string", description: "Start, ISO 8601 (e.g. 2026-08-26T09:00:00Z)." },
        patientName: { type: "string", description: "The patient's full name." },
      },
      required: ["serviceName", "dentistName", "start", "patientName"],
    },
  },
  {
    name: "cancel_booking",
    description:
      "Cancel one of the logged-in patient's own appointments by its id (the 'id' field from " +
      "get_my_appointments). Call get_my_appointments first to find the id, and confirm with " +
      "the patient which appointment they mean before cancelling. Never show the id to the " +
      "patient. Requires the patient to be logged in; a patient can only cancel their own " +
      "appointment.",
    parameters: {
      type: "object",
      properties: {
        bookingId: {
          type: "integer",
          description: "The appointment's id, from get_my_appointments.",
        },
      },
      required: ["bookingId"],
    },
  },
];

// Model output is untrusted: validate every argument before it reaches the DB.
const schemas = {
  get_professionals_for_service: z.object({ serviceName: z.string().min(1) }),
  check_availability: z.object({
    serviceName: z.string().min(1),
    dentistName: z.string().min(1),
    day: z.string(),
  }),
  request_login_code: z.object({ email: z.string().email() }),
  verify_login_code: z.object({ email: z.string().email(), code: z.string() }),
  create_booking: z.object({
    serviceName: z.string().min(1),
    dentistName: z.string().min(1),
    start: z.string(),
    patientName: z.string().min(1),
  }),
  cancel_booking: z.object({ bookingId: z.number().int() }),
};

// Server-managed, never from the model. bookingConfirmed/bookingCancelled record
// what actually happened this turn; the chat loop checks the reply against them.
// patientTimeZone is display only and never affects which slots exist.
export interface ToolContext {
  authedEmail?: string;
  authenticatedAs?: string;
  bookingConfirmed?: boolean;
  bookingCancelled?: boolean;
  patientTimeZone?: string;
}

// Undefined keys are dropped by JSON.stringify, so a patient in the clinic's own
// zone sees no extra field.
function timeLabels(at: Date, ctx: ToolContext) {
  const elsewhere = ctx.patientTimeZone && ctx.patientTimeZone !== CLINIC.timeZone;
  return {
    time: formatZonedTime(at, CLINIC.timeZone),
    yourLocalTime: elsewhere ? formatZonedTime(at, ctx.patientTimeZone!) : undefined,
  };
}

// Never throws on bad input — returns an { error } payload the model can read.
export async function runTool(
  name: string,
  argsJson: string,
  ctx: ToolContext = {},
): Promise<string> {
  const args = parseJson(argsJson);
  if (args === undefined) return errorResult(`Tool "${name}" got invalid JSON arguments.`);

  switch (name) {
    case "list_services":
      return JSON.stringify(await getServiceCatalog());

    case "get_professionals_for_service": {
      const parsed = schemas.get_professionals_for_service.safeParse(args);
      if (!parsed.success) return errorResult(zodMessage(parsed.error));
      const svc = await resolveService(parsed.data.serviceName);
      if ("error" in svc) return errorResult(svc.error);
      return JSON.stringify(await getProfessionalsForServiceByCode(svc.service.code));
    }

    case "check_availability": {
      const parsed = schemas.check_availability.safeParse(args);
      if (!parsed.success) return errorResult(zodMessage(parsed.error));
      const day = parseClinicDay(parsed.data.day);
      if (!day) return errorResult(`Invalid day "${parsed.data.day}" — expected YYYY-MM-DD.`);
      const svc = await resolveService(parsed.data.serviceName);
      if ("error" in svc) return errorResult(svc.error);
      const den = await resolveDentist(svc.service.code, svc.service.name, parsed.data.dentistName);
      if ("error" in den) return errorResult(den.error);
      const now = new Date();
      const result = await findAvailabilityForProfessional(pgBookingRepository, {
        serviceCode: svc.service.code,
        professionalId: den.dentist.professionalId,
        day,
        patientEmail: ctx.authedEmail, // exclude the logged-in patient's own conflicts
        now,
      });
      if ("error" in result) return JSON.stringify(result);

      const payload: Record<string, unknown> = {
        ...result,
        day: clinicDayLabel(day),
        clinicTimeZone: CLINIC.timeZone,
        currentClinicTime: formatZonedTime(now, CLINIC.timeZone),
        slots: result.slots.map((s) => {
          const ends = addMinutes(s, result.service.durationMinutes);
          return {
            start: s.toISOString(),
            ...timeLabels(s, ctx),
            ends: formatZonedTime(ends, CLINIC.timeZone),
          };
        }),
      };

      // Lets the model tell "you're already booked" from "the dentist is booked".
      if (ctx.authedEmail) {
        const yours = (await getAppointmentsForPatient(ctx.authedEmail))
          .filter((a) => sameZonedDay(a.start, day, CLINIC.timeZone))
          .map((a) => describeAppointment(a, ctx));
        if (yours.length > 0) {
          payload.yourExistingAppointments = yours;
          payload.yourExistingAppointmentsNote =
            "These are the PATIENT's own appointments that day, and the times they cover " +
            "were removed from 'slots'. If the patient asks for one of those times, the " +
            "clash is THEIRS, not the dentist's: say \"you already have a <service> with " +
            '<dentist> at <time>" — never say the dentist is unavailable. Only call the ' +
            "dentist booked when a missing time does not overlap any appointment listed here.";
        }
      }
      return JSON.stringify(payload);
    }

    case "request_login_code": {
      // The model asks for an email even when logged in, so the tool redirects it.
      if (ctx.authedEmail) {
        return JSON.stringify({
          ok: true,
          alreadyLoggedIn: true,
          message: `The patient is already logged in and verified as ${ctx.authedEmail}. Do NOT ask for their email or verify again — call get_my_appointments or create_booking directly.`,
        });
      }
      const parsed = schemas.request_login_code.safeParse(args);
      if (!parsed.success) return errorResult(zodMessage(parsed.error));
      if (
        !rateLimit(`otp-req:${parsed.data.email}`, {
          max: OTP_REQUEST_MAX,
          windowMs: OTP_WINDOW_MS,
        }).allowed
      ) {
        return errorResult("Too many code requests for that email. Please wait a few minutes.");
      }
      const code = await createOtp(parsed.data.email);
      try {
        await getMailer().sendOtp(parsed.data.email, code);
      } catch (err) {
        console.error("mailer sendOtp failed:", err);
        return errorResult(
          "I couldn't send the verification code to that email right now. Please double-check " +
            "the address, or try again in a moment.",
        );
      }
      return JSON.stringify({
        ok: true,
        message: `A 6-digit code was sent to ${parsed.data.email}.`,
      });
    }

    case "verify_login_code": {
      if (ctx.authedEmail) {
        return JSON.stringify({
          ok: true,
          alreadyLoggedIn: true,
          message: `The patient is already logged in as ${ctx.authedEmail}. No verification needed — proceed directly.`,
        });
      }
      const parsed = schemas.verify_login_code.safeParse(args);
      if (!parsed.success) return errorResult(zodMessage(parsed.error));
      if (
        !rateLimit(`otp-verify:${parsed.data.email}`, {
          max: OTP_VERIFY_MAX,
          windowMs: OTP_WINDOW_MS,
        }).allowed
      ) {
        return JSON.stringify({
          ok: false,
          message: "Too many attempts. Please request a new code and wait a few minutes.",
        });
      }
      if (!(await verifyOtp(parsed.data.email, parsed.data.code))) {
        return JSON.stringify({ ok: false, message: "That code is invalid or expired." });
      }
      await findOrCreatePatient(parsed.data.email, parsed.data.email.split("@")[0]);
      ctx.authedEmail = parsed.data.email; // authenticated for the rest of this request
      ctx.authenticatedAs = parsed.data.email; // route persists the session cookie
      return JSON.stringify({ ok: true, message: "Email verified — you're logged in." });
    }

    case "get_my_appointments": {
      // Identity comes from the session, never the model — no reading others' data.
      if (!ctx.authedEmail) {
        return errorResult("The patient must be logged in to view their appointments.");
      }
      const appointments = await getAppointmentsForPatient(ctx.authedEmail);
      // Split here, not in the prompt. Whether an appointment has happened is a
      // fact about the clock, and the model has to infer "now" from a sentence
      // while this can simply read it — the same reason it never decides
      // availability. Returned flat, it read a finished visit and a booking
      // tomorrow out in one undifferentiated list.
      const now = Date.now();
      const past: ReturnType<typeof describeAppointment>[] = [];
      const upcoming: ReturnType<typeof describeAppointment>[] = [];
      for (const a of appointments) {
        // An appointment being sat through right now is not over.
        (a.end.getTime() <= now ? past : upcoming).push(describeAppointment(a, ctx));
      }
      return JSON.stringify({ upcoming, past });
    }

    case "create_booking": {
      // Email comes from the session: a patient can only book under their own address.
      if (!ctx.authedEmail) {
        return errorResult(
          "The patient must verify their email (request + verify a code) before booking.",
        );
      }
      const parsed = schemas.create_booking.safeParse(args);
      if (!parsed.success) return errorResult(zodMessage(parsed.error));
      const start = new Date(parsed.data.start);
      if (Number.isNaN(start.getTime()))
        return errorResult(`Invalid start "${parsed.data.start}".`);
      const now = new Date();
      if (start.getTime() <= now.getTime()) {
        return errorResult(
          `Cannot book ${formatZonedTime(start, CLINIC.timeZone)} on ` +
            `${formatZonedDate(start, CLINIC.timeZone)} — that time has already passed. ` +
            `It is now ${formatZonedTime(now, CLINIC.timeZone)}.`,
        );
      }
      // Resolved from NAMES in code — the model is unreliable with numeric ids.
      // An unknown name is rejected, never silently substituted.
      const svc = await resolveService(parsed.data.serviceName);
      if ("error" in svc) return errorResult(svc.error);
      const den = await resolveDentist(svc.service.code, svc.service.name, parsed.data.dentistName);
      if ("error" in den) return errorResult(den.error);
      const result = await createBooking(pgBookingRepository, {
        serviceCode: svc.service.code,
        professionalId: den.dentist.professionalId,
        start,
        patientName: parsed.data.patientName,
        patientEmail: ctx.authedEmail,
        now,
      });

      // Fire-and-forget: an email failure must not undo a committed booking.
      if (result.ok) {
        ctx.bookingConfirmed = true;
        try {
          const dentist = await getProfessionalContact(result.professional.id);
          await getMailer().sendInvite({
            uid: `booking-${result.booking.id}@brightsmile`,
            summary: `${result.service.name} with ${result.professional.name}`,
            description: `Your ${result.service.name} appointment at Bright Smile Clinic.`,
            start: result.booking.start,
            end: result.booking.end,
            organizer: {
              name: "Bright Smile Clinic",
              email: process.env.SMTP_USER ?? "no-reply@brightsmile.example",
            },
            attendees: [
              { name: parsed.data.patientName, email: ctx.authedEmail },
              ...(dentist ? [{ name: dentist.name, email: dentist.email }] : []),
            ],
          });
        } catch (err) {
          console.error("sendInvite failed:", err);
        }
        return JSON.stringify({
          ...result,
          confirmed: {
            service: result.service.name,
            dentist: result.professional.name,
            date: formatZonedDate(result.booking.start, CLINIC.timeZone),
            time: clinicRange(result.booking.start, result.booking.end, CLINIC.timeZone),
            yourLocalTime:
              ctx.patientTimeZone && ctx.patientTimeZone !== CLINIC.timeZone
                ? clinicRange(result.booking.start, result.booking.end, ctx.patientTimeZone)
                : undefined,
          },
        });
      }
      return JSON.stringify({
        ...result,
        confirmed: null,
        instruction:
          "This booking was NOT made. Tell the patient plainly that it did not go " +
          "through, give the reason above, and offer an alternative. Never say it " +
          "is confirmed.",
      });
    }

    case "cancel_booking": {
      if (!ctx.authedEmail) {
        return errorResult("The patient must be logged in to cancel an appointment.");
      }
      const parsed = schemas.cancel_booking.safeParse(args);
      if (!parsed.success) return errorResult(zodMessage(parsed.error));
      // Ownership enforced in the WHERE clause — no IDOR, no double-cancel.
      const cancelled = await cancelBookingForPatient(parsed.data.bookingId, ctx.authedEmail);
      if (!cancelled) {
        return errorResult("No matching upcoming appointment found under your account to cancel.");
      }
      ctx.bookingCancelled = true;
      try {
        const dentist = await getProfessionalContact(cancelled.professionalId);
        await getMailer().sendInvite({
          uid: `booking-${cancelled.id}@brightsmile`,
          method: "CANCEL",
          sequence: 1,
          summary: `${cancelled.serviceName} with ${cancelled.professionalName}`,
          description: `Your ${cancelled.serviceName} appointment at Bright Smile Clinic has been cancelled.`,
          start: cancelled.start,
          end: cancelled.end,
          organizer: {
            name: "Bright Smile Clinic",
            email: process.env.SMTP_USER ?? "no-reply@brightsmile.example",
          },
          attendees: [
            { name: cancelled.patientName, email: ctx.authedEmail },
            ...(dentist ? [{ name: dentist.name, email: dentist.email }] : []),
          ],
        });
      } catch (err) {
        console.error("sendInvite (cancel) failed:", err);
      }
      return JSON.stringify({ ok: true, cancelled });
    }

    default:
      return errorResult(`Unknown tool "${name}".`);
  }
}

// Names, not codes: what the patient says and the model reliably echoes.
async function resolveService(
  serviceName: string,
): Promise<{ service: { code: string; name: string } } | { error: string }> {
  const catalog = await getServiceCatalog();
  const service = matchByName(catalog, serviceName, (s) => s.name);
  if (!service) {
    return {
      error: `Unknown service "${serviceName}". Available: ${catalog.map((s) => s.name).join(", ")}.`,
    };
  }
  return { service };
}

// Rejects an unknown name instead of substituting a different dentist.
async function resolveDentist(
  serviceCode: string,
  serviceName: string,
  dentistName: string,
): Promise<{ dentist: { professionalId: number; name: string } } | { error: string }> {
  const providers = await getProfessionalsForServiceByCode(serviceCode);
  const dentist = providers && matchByName(providers, dentistName, (p) => p.name);
  if (!dentist) {
    const names = (providers ?? []).map((p) => p.name).join(", ");
    return {
      error: `${dentistName} does not offer ${serviceName}. Dentists for ${serviceName}: ${names || "none"}.`,
    };
  }
  return { dentist };
}

// Anchored at noon so a DST shift near midnight cannot land on the adjacent day.
function parseClinicDay(day: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(day.trim());
  if (!match) return undefined;
  const anchor = zonedTimeToUtc(
    { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), hour: 12 },
    CLINIC.timeZone,
  );
  return Number.isNaN(anchor.getTime()) ? undefined : anchor;
}

function clinicDayLabel(day: Date): string {
  return formatZonedDate(day, CLINIC.timeZone);
}

function describeAppointment(
  a: { id: number; service: string; dentist: string; title: string; start: Date; end: Date },
  ctx: ToolContext,
) {
  const elsewhere = ctx.patientTimeZone && ctx.patientTimeZone !== CLINIC.timeZone;
  return {
    id: a.id,
    service: a.service,
    dentist: a.dentist,
    title: a.title,
    date: formatZonedDate(a.start, CLINIC.timeZone),
    time: clinicRange(a.start, a.end, CLINIC.timeZone),
    yourLocalTime: elsewhere ? clinicRange(a.start, a.end, ctx.patientTimeZone!) : undefined,
    start: a.start.toISOString(),
    end: a.end.toISOString(),
  };
}

function clinicRange(start: Date, end: Date, timeZone: string): string {
  return `${formatZonedTime(start, timeZone)} – ${formatZonedTime(end, timeZone)}`;
}

// Exact match first, then a unique substring. Ambiguous -> undefined, so
// callers reject rather than guess.
function matchByName<T>(items: T[], query: string, nameOf: (item: T) => string): T | undefined {
  const q = query.trim().toLowerCase();
  const exact = items.filter((i) => nameOf(i).toLowerCase() === q);
  if (exact.length === 1) return exact[0];
  const partial = items.filter((i) => {
    const n = nameOf(i).toLowerCase();
    return n.includes(q) || q.includes(n);
  });
  return partial.length === 1 ? partial[0] : undefined;
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return undefined;
  }
}

function errorResult(message: string): string {
  return JSON.stringify({ error: message });
}

function zodMessage(error: z.ZodError): string {
  return (
    "Invalid arguments: " + error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")
  );
}
