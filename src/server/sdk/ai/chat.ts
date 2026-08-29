import { getLLMProvider, type ChatMessage } from "./providers";
import { runTool, toolDefs, type ToolContext } from "./tools";

const MAX_ITERATIONS = 6;
const MAX_CORRECTIONS = 1;

const FALLBACK_REPLY =
  "Sorry, I'm having trouble completing that right now. Please try again, or rephrase your request.";

// Tool payloads carry the patient's login code, email and name. otp.ts hashes
// the code at rest and never stores it in plaintext, so printing it here would
// defeat that control: a log reader could sign in as the patient inside the
// code's ten-minute window. Names are logged always because they are useful and
// harmless; payloads only when explicitly asked for, and never unredacted.
const LOG_TOOL_PAYLOADS = process.env.DEBUG_TOOL_PAYLOADS === "1";
const SENSITIVE_KEYS = new Set(["code", "email", "patientemail", "patientname", "name", "attendees"]);
const MAX_PAYLOAD_CHARS = 1000;

export function redactToolPayload(raw: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Tool results are not always JSON, and a logger must never throw.
    return raw.length > MAX_PAYLOAD_CHARS ? `${raw.slice(0, MAX_PAYLOAD_CHARS)}…` : raw;
  }
  const out = JSON.stringify(scrub(parsed));
  return out.length > MAX_PAYLOAD_CHARS ? `${out.slice(0, MAX_PAYLOAD_CHARS)}…` : out;
}

function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) =>
      SENSITIVE_KEYS.has(k.toLowerCase()) ? [k, "[redacted]"] : [k, scrub(v)],
    ),
  );
}

export interface ChatResult {
  reply: string;
  messages: ChatMessage[]; // full history incl. assistant + tool messages, to persist
  totalTokens: number;
}

// Hand-written tool-calling loop. The model can only act through runTool, and its
// final answer is checked against what those tools actually did.
export async function runChat(history: ChatMessage[], ctx: ToolContext = {}): Promise<ChatResult> {
  const provider = getLLMProvider();
  const messages: ChatMessage[] = [...history];
  let totalTokens = 0;
  let corrections = 0;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    // temperature 0: a tool-calling agent, not a creative writer.
    const { message, usage } = await provider.chat({ messages, tools: toolDefs, temperature: 0 });
    totalTokens += usage.totalTokens;
    messages.push(message); // assistant turn (may carry toolCalls) — push BEFORE results

    if (!message.toolCalls || message.toolCalls.length === 0) {
      const claim = unsupportedClaim(message.content, ctx);
      if (!claim) return { reply: message.content, messages, totalTokens };

      console.warn(`[guard] unsupported ${claim.kind} claim — no successful tool call backed it`);
      if (corrections < MAX_CORRECTIONS) {
        corrections++;
        // "user", not "system": a correction only works if read LAST, and some
        // providers hoist system messages to the front of the conversation.
        messages.push({ role: "user", content: claim.correction });
        continue; // give the model one chance to do it properly
      }
      return { reply: claim.fallback, messages, totalTokens };
    }

    for (const call of message.toolCalls) {
      console.log(`[tool] call ${call.name}`);
      const result = await runTool(call.name, call.arguments, ctx);
      if (LOG_TOOL_PAYLOADS) {
        console.log(`[tool]   args   ${redactToolPayload(call.arguments)}`);
        console.log(`[tool]   result ${redactToolPayload(result)}`);
      }
      messages.push({ role: "tool", content: result, toolCallId: call.id, name: call.name });
    }
  }

  return { reply: FALLBACK_REPLY, messages, totalTokens };
}

// A model will state an outcome it never produced, so the text is checked.
const BOOKED_PATTERNS = [
  /\byour (?:appointment|booking)\b[^.!?\n]{0,80}\b(?:is|has been|was)\b[^.!?\n]{0,24}\b(?:confirmed|booked|scheduled|set)\b/i,
  /\bi(?:'ve| have)\s+(?:now\s+)?(?:booked|scheduled|confirmed)\b/i,
  /\byou(?:'re| are)\s+(?:now\s+)?(?:all set|booked in|scheduled)\b/i,
  /\b(?:appointment|booking)\s+confirmed\b/i,
];

const CANCELLED_PATTERNS = [
  /\byour (?:appointment|booking)\b[^.!?\n]{0,80}\b(?:has been|was|is)\b[^.!?\n]{0,24}\bcancell?ed\b/i,
  /\bi(?:'ve| have)\s+cancell?ed\b/i,
  /\bcancellation\b[^.!?\n]{0,24}\b(?:confirmed|complete[d]?|successful)\b/i,
];

interface UnsupportedClaim {
  kind: "booking" | "cancellation";
  correction: string; // system nudge, so the model can fix it itself
  fallback: string; // what the patient sees if it will not
}

function unsupportedClaim(reply: string, ctx: ToolContext): UnsupportedClaim | undefined {
  if (!ctx.bookingConfirmed && BOOKED_PATTERNS.some((p) => p.test(reply))) {
    return {
      kind: "booking",
      correction:
        "STOP. Your reply announced a confirmed appointment, but you never made one — " +
        "no create_booking call succeeded in this turn. Nothing was saved. Either call " +
        "create_booking now with the service name, dentist name and ISO start time the " +
        "patient agreed to, or tell the patient plainly that it is not booked yet and ask " +
        "for the missing detail. Never state an appointment is confirmed unless " +
        "create_booking returned it.",
      fallback:
        "Sorry — that isn't booked yet. Nothing was saved to our schedule. " +
        "Tell me the dentist and the time you'd like and I'll book it properly.",
    };
  }
  if (!ctx.bookingCancelled && CANCELLED_PATTERNS.some((p) => p.test(reply))) {
    return {
      kind: "cancellation",
      correction:
        "STOP. Your reply said an appointment was cancelled, but no cancel_booking call " +
        "succeeded in this turn, so it is still on the schedule. Call get_my_appointments " +
        "to find the right id and then cancel_booking, or tell the patient it was not " +
        "cancelled. Never claim a cancellation that did not happen.",
      fallback:
        "Sorry — that appointment is still on our schedule; the cancellation didn't go " +
        "through. Tell me which appointment to cancel and I'll try again.",
    };
  }
  return undefined;
}
