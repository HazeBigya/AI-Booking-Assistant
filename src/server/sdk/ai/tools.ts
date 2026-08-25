import { z } from "zod";
import type { ToolDef } from "./providers";
import { getProfessionalsForServiceByCode, getServiceCatalog } from "@server/db/queries/catalog";
import { getProfessionalContact } from "@server/db/queries/professionals";
import { getAppointmentsForPatient } from "@server/db/queries/appointments";
import { cancelBookingForPatient } from "@server/db/queries/bookings";
import { pgBookingRepository } from "@server/db/queries";
import { createBooking, findAvailabilityForProfessional } from "@server/domain/booking/scheduler";
import { createOtp, verifyOtp } from "@server/auth/otp";
import { findOrCreatePatient } from "@server/auth/patients";
import { getMailer } from "@server/sdk/mailer";
import { rateLimit } from "@server/shared/rate-limit";

// OTP abuse limits (per email, 10-min window): cap code requests (inbox spam)
// and verify attempts (brute-forcing the 6-digit code).
const OTP_WINDOW_MS = 10 * 60_000;
const OTP_REQUEST_MAX = 3;
const OTP_VERIFY_MAX = 5;

// What the model sees. Descriptions guide it; the JSON Schema constrains args.
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
      properties: { serviceName: { type: "string", description: "The service name, e.g. 'Root Canal'." } },
      required: ["serviceName"],
    },
  },
  {
    name: "check_availability",
    description:
      "Get one dentist's open appointment slots for a service on a given day. Pass the service " +
      "and dentist by NAME exactly as the patient said them.",
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
      "List ALL of the logged-in patient's own appointments — past and upcoming — with dentist. " +
      "No arguments; identity comes from the verified session. Requires the patient to be logged in.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "create_booking",
    description:
      "Book an appointment for the logged-in patient. Requires the patient to be verified " +
      "(via request_login_code + verify_login_code) first; the email comes from the session. " +
      "Pass the service and dentist by NAME exactly as the patient asked — the backend resolves " +
      "them and will reject an unknown name, so never guess or substitute a different dentist.",
    parameters: {
      type: "object",
      properties: {
        serviceName: { type: "string", description: "The service name, e.g. 'Root Canal' or 'Teeth Whitening'." },
        dentistName: { type: "string", description: "The dentist's name exactly as the patient requested, e.g. 'John'." },
        start: { type: "string", description: "Start, ISO 8601 (e.g. 2026-08-26T09:00:00Z)." },
        patientName: { type: "string", description: "The patient's full name." },
      },
      required: ["serviceName", "dentistName", "start", "patientName"],
    },
  },
  {
    name: "cancel_booking",
    description:
      "Cancel one of the logged-in patient's own appointments by its id (the 'id' " +
      "field from get_my_appointments). Requires the patient to be logged in; a " +
      "patient can only cancel their own appointment.",
    parameters: {
      type: "object",
      properties: {
        bookingId: { type: "integer", description: "The appointment's id, from get_my_appointments." },
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

// Server-managed context, never from the model:
//   authedEmail     - the verified patient this request (incoming session, or set
//                     by verify_login_code mid-conversation). Gates booking + lookup.
//   authenticatedAs - set by verify_login_code on success; signals the route to
//                     persist the session cookie.
export interface ToolContext {
  authedEmail?: string;
  authenticatedAs?: string;
}

// Runs one tool call and returns a JSON string to feed back to the model.
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
      const day = new Date(parsed.data.day);
      if (Number.isNaN(day.getTime())) return errorResult(`Invalid day "${parsed.data.day}".`);
      const svc = await resolveService(parsed.data.serviceName);
      if ("error" in svc) return errorResult(svc.error);
      const den = await resolveDentist(svc.service.code, svc.service.name, parsed.data.dentistName);
      if ("error" in den) return errorResult(den.error);
      const result = await findAvailabilityForProfessional(pgBookingRepository, {
        serviceCode: svc.service.code,
        professionalId: den.dentist.professionalId,
        day,
        patientEmail: ctx.authedEmail, // exclude the logged-in patient's own conflicts
      });
      // Never offer slots in the past. "now" is a temporal/IO concern, applied at
      // this boundary so the pure scheduler stays deterministic and testable.
      if ("slots" in result) {
        const now = Date.now();
        result.slots = result.slots.filter((s) => s.getTime() > now);
        // Include the patient's OWN appointments that day so the model can tell
        // "you're already booked then" apart from "the dentist is booked". A slot
        // hidden here may be the patient's conflict, not the dentist's.
        if (ctx.authedEmail) {
          const yourExistingAppointments = (await getAppointmentsForPatient(ctx.authedEmail))
            .filter((a) => sameUtcDay(a.start, day))
            .map((a) => ({ service: a.service, dentist: a.dentist, start: a.start, end: a.end }));
          return JSON.stringify({ ...result, yourExistingAppointments });
        }
      }
      return JSON.stringify(result);
    }

    case "request_login_code": {
      // Deterministic: if already logged in, don't re-verify — the model tends to
      // ask for email anyway, so the tool itself redirects it. No email is sent.
      if (ctx.authedEmail) {
        return JSON.stringify({
          ok: true,
          alreadyLoggedIn: true,
          message: `The patient is already logged in and verified as ${ctx.authedEmail}. Do NOT ask for their email or verify again — call get_my_appointments or create_booking directly.`,
        });
      }
      const parsed = schemas.request_login_code.safeParse(args);
      if (!parsed.success) return errorResult(zodMessage(parsed.error));
      if (!rateLimit(`otp-req:${parsed.data.email}`, { max: OTP_REQUEST_MAX, windowMs: OTP_WINDOW_MS }).allowed) {
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
      return JSON.stringify({ ok: true, message: `A 6-digit code was sent to ${parsed.data.email}.` });
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
      if (!rateLimit(`otp-verify:${parsed.data.email}`, { max: OTP_VERIFY_MAX, windowMs: OTP_WINDOW_MS }).allowed) {
        return JSON.stringify({ ok: false, message: "Too many attempts. Please request a new code and wait a few minutes." });
      }
      // Deterministic check — the model only relays the code; it never decides.
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
      return JSON.stringify(await getAppointmentsForPatient(ctx.authedEmail));
    }

    case "create_booking": {
      // Gated: must be verified. Email comes from the session, so a patient can
      // only ever book under their own verified (deliverable) address.
      if (!ctx.authedEmail) {
        return errorResult("The patient must verify their email (request + verify a code) before booking.");
      }
      const parsed = schemas.create_booking.safeParse(args);
      if (!parsed.success) return errorResult(zodMessage(parsed.error));
      const start = new Date(parsed.data.start);
      if (Number.isNaN(start.getTime())) return errorResult(`Invalid start "${parsed.data.start}".`);
      // Deterministic guard: never book a time in the past, whatever the model asks.
      if (start.getTime() <= Date.now()) {
        return errorResult(`Cannot book ${parsed.data.start} — that time is in the past.`);
      }
      // Resolve the service and dentist from their NAMES in code — the model is
      // unreliable at tracking numeric ids/codes, so it never handles them. An
      // unknown name is rejected (never silently substituted).
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
      });

      // Fire-and-forget calendar invite after a successful booking — never lets
      // an email failure undo a committed booking.
      if (result.ok) {
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
      }
      return JSON.stringify(result);
    }

    case "cancel_booking": {
      if (!ctx.authedEmail) {
        return errorResult("The patient must be logged in to cancel an appointment.");
      }
      const parsed = schemas.cancel_booking.safeParse(args);
      if (!parsed.success) return errorResult(zodMessage(parsed.error));
      // Ownership is enforced in SQL (WHERE id + patient_email + status='booked'):
      // a patient can only cancel their own still-booked appointment.
      const cancelled = await cancelBookingForPatient(parsed.data.bookingId, ctx.authedEmail);
      if (!cancelled) {
        return errorResult("No matching upcoming appointment found under your account to cancel.");
      }
      // Fire-and-forget CANCEL invite so both calendars drop the event.
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

// Resolve a service by name; returns the matched service or an error message.
// Names (not codes) are what the patient says and the model reliably echoes.
async function resolveService(
  serviceName: string,
): Promise<{ service: { code: string; name: string } } | { error: string }> {
  const catalog = await getServiceCatalog();
  const service = matchByName(catalog, serviceName, (s) => s.name);
  if (!service) {
    return { error: `Unknown service "${serviceName}". Available: ${catalog.map((s) => s.name).join(", ")}.` };
  }
  return { service };
}

// Resolve a dentist by name WITHIN a service's provider list. Rejects an unknown
// name (listing valid dentists) instead of silently substituting another dentist.
async function resolveDentist(
  serviceCode: string,
  serviceName: string,
  dentistName: string,
): Promise<{ dentist: { professionalId: number; name: string } } | { error: string }> {
  const providers = await getProfessionalsForServiceByCode(serviceCode);
  const dentist = providers && matchByName(providers, dentistName, (p) => p.name);
  if (!dentist) {
    const names = (providers ?? []).map((p) => p.name).join(", ");
    return { error: `${dentistName} does not offer ${serviceName}. Dentists for ${serviceName}: ${names || "none"}.` };
  }
  return { dentist };
}

// Same calendar day in UTC (clinic time is UTC by our simplification).
function sameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

// Case-insensitive name match: exact first, then a unique substring match.
// Returns undefined if nothing matches or a substring match is ambiguous —
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
  return "Invalid arguments: " + error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ");
}
