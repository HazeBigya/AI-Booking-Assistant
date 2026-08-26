import { getLLMProvider, type ChatMessage } from "./providers";
import { runTool, toolDefs, type ToolContext } from "./tools";

const MAX_ITERATIONS = 6;
const MAX_CORRECTIONS = 1;

const FALLBACK_REPLY =
  "Sorry, I'm having trouble completing that right now. Please try again, or rephrase your request.";

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
      console.log(`[tool] call ${call.name} args=${call.arguments}`);
      const result = await runTool(call.name, call.arguments, ctx);
      console.log(`[tool] result ${call.name} -> ${result.slice(0, 400)}`);
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
