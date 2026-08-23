import { z } from "zod";
import type { ToolDef } from "./providers";
import { getProfessionalsForServiceByCode, getServiceCatalog } from "@server/db/queries/catalog";
import { getProfessionalContact } from "@server/db/queries/professionals";
import { getAppointmentsForPatient } from "@server/db/queries/appointments";
import { pgBookingRepository } from "@server/db/queries";
import { createBooking, findAvailabilityForProfessional } from "@server/domain/booking/scheduler";
import { createOtp, verifyOtp } from "@server/auth/otp";
import { findOrCreatePatient } from "@server/auth/patients";
import { getMailer } from "@server/sdk/mailer";

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
      properties: { serviceCode: { type: "string", description: "The service code, A–E." } },
      required: ["serviceCode"],
    },
  },
  {
    name: "check_availability",
    description: "Get one dentist's open appointment slots for a service on a given day.",
    parameters: {
      type: "object",
      properties: {
        serviceCode: { type: "string", description: "The service code, A–E." },
        professionalId: { type: "integer", description: "The dentist's id." },
        day: { type: "string", description: "The day, as YYYY-MM-DD." },
      },
      required: ["serviceCode", "professionalId", "day"],
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
      "List the logged-in patient's own booked appointments (with dentist). No arguments — " +
      "identity comes from the verified session. Requires the patient to be logged in.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "create_booking",
    description:
      "Book an appointment for the logged-in patient. Requires the patient to be verified " +
      "(via request_login_code + verify_login_code) first; the email comes from the session.",
    parameters: {
      type: "object",
      properties: {
        serviceCode: { type: "string", description: "The service code, A–E." },
        professionalId: { type: "integer", description: "The dentist's id." },
        start: { type: "string", description: "Start, ISO 8601 (e.g. 2026-08-24T09:00:00Z)." },
        patientName: { type: "string", description: "The patient's full name." },
      },
      required: ["serviceCode", "professionalId", "start", "patientName"],
    },
  },
];

// Model output is untrusted: validate every argument before it reaches the DB.
const schemas = {
  get_professionals_for_service: z.object({ serviceCode: z.string() }),
  check_availability: z.object({
    serviceCode: z.string(),
    professionalId: z.number().int(),
    day: z.string(),
  }),
  request_login_code: z.object({ email: z.string().email() }),
  verify_login_code: z.object({ email: z.string().email(), code: z.string() }),
  create_booking: z.object({
    serviceCode: z.string(),
    professionalId: z.number().int(),
    start: z.string(),
    patientName: z.string().min(1),
  }),
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
      const list = await getProfessionalsForServiceByCode(parsed.data.serviceCode);
      if (list === null) return errorResult(`Unknown service code "${parsed.data.serviceCode}".`);
      return JSON.stringify(list);
    }

    case "check_availability": {
      const parsed = schemas.check_availability.safeParse(args);
      if (!parsed.success) return errorResult(zodMessage(parsed.error));
      const day = new Date(parsed.data.day);
      if (Number.isNaN(day.getTime())) return errorResult(`Invalid day "${parsed.data.day}".`);
      const result = await findAvailabilityForProfessional(pgBookingRepository, {
        serviceCode: parsed.data.serviceCode,
        professionalId: parsed.data.professionalId,
        day,
        patientEmail: ctx.authedEmail, // exclude the logged-in patient's own conflicts
      });
      return JSON.stringify(result);
    }

    case "request_login_code": {
      const parsed = schemas.request_login_code.safeParse(args);
      if (!parsed.success) return errorResult(zodMessage(parsed.error));
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
      const parsed = schemas.verify_login_code.safeParse(args);
      if (!parsed.success) return errorResult(zodMessage(parsed.error));
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
      const result = await createBooking(pgBookingRepository, {
        serviceCode: parsed.data.serviceCode,
        professionalId: parsed.data.professionalId,
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

    default:
      return errorResult(`Unknown tool "${name}".`);
  }
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
