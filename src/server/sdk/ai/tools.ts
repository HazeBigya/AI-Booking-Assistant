import { z } from "zod";
import type { ToolDef } from "./providers";
import { getProfessionalsForServiceByCode, getServiceCatalog } from "@server/db/queries/catalog";
import { getAppointmentsForPatient } from "@server/db/queries/appointments";
import { pgBookingRepository } from "@server/db/queries";
import { createBooking, findAvailabilityForProfessional } from "@server/domain/booking/scheduler";

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
      properties: {
        serviceCode: { type: "string", description: "The service code, A–E." },
      },
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
        patientEmail: {
          type: "string",
          description: "The patient's email, once known — excludes times they are already booked.",
        },
      },
      required: ["serviceCode", "professionalId", "day"],
    },
  },
  {
    name: "get_my_appointments",
    description:
      "List the LOGGED-IN patient's own booked appointments (with dentist). Takes no " +
      "arguments — identity comes from the session. Requires the patient to be logged in.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "create_booking",
    description: "Book an appointment. Only call after collecting the patient's name and email.",
    parameters: {
      type: "object",
      properties: {
        serviceCode: { type: "string", description: "The service code, A–E." },
        professionalId: { type: "integer", description: "The dentist's id." },
        start: { type: "string", description: "Appointment start, ISO 8601 (e.g. 2026-08-24T09:00:00Z)." },
        patientName: { type: "string" },
        patientEmail: { type: "string" },
      },
      required: ["serviceCode", "professionalId", "start", "patientName", "patientEmail"],
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
    patientEmail: z.string().email().optional(),
  }),
  create_booking: z.object({
    serviceCode: z.string(),
    professionalId: z.number().int(),
    start: z.string(),
    patientName: z.string().min(1),
    patientEmail: z.string().email(),
  }),
};

// Auth context injected by the server (never from the model) — the identity that
// gates get_my_appointments.
export interface ToolContext {
  authedEmail?: string;
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
        patientEmail: parsed.data.patientEmail,
      });
      return JSON.stringify(result);
    }

    case "get_my_appointments": {
      // Identity comes from the session, never from the model — this is what
      // prevents reading anyone else's appointments (no IDOR).
      if (!ctx.authedEmail) {
        return errorResult("The patient must be logged in to view their appointments.");
      }
      return JSON.stringify(await getAppointmentsForPatient(ctx.authedEmail));
    }

    case "create_booking": {
      const parsed = schemas.create_booking.safeParse(args);
      if (!parsed.success) return errorResult(zodMessage(parsed.error));
      const start = new Date(parsed.data.start);
      if (Number.isNaN(start.getTime())) return errorResult(`Invalid start "${parsed.data.start}".`);
      const result = await createBooking(pgBookingRepository, {
        serviceCode: parsed.data.serviceCode,
        professionalId: parsed.data.professionalId,
        start,
        patientName: parsed.data.patientName,
        patientEmail: parsed.data.patientEmail,
      });
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
