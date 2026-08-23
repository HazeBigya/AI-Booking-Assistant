import type { ChatMessage, LLMProvider } from "./providers";
import { INTENT_LABELS } from "./prompt";

// Layer 1: a cheap pre-filter that short-circuits clearly off-topic requests
// before the main call. It sees recent context (so "is Oscar or Kate better?"
// is understood as a dentist question) and is biased toward in_scope — the main
// model + system prompt is the real scope guard; the gate must not block valid
// questions. User text is data to classify, never instructions to obey.
export async function isInScope(provider: LLMProvider, history: ChatMessage[]): Promise<boolean> {
  const recent = history
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-4)
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  const input =
    "You gate a DENTAL CLINIC receptionist.\n" +
    "IN SCOPE: the clinic's services, its dentists and their experience / expertise / " +
    "who is better for a service, prices, availability, and booking or changing " +
    "appointments.\n" +
    "OUT OF SCOPE: writing code, general knowledge, other topics, medical diagnosis.\n" +
    "When unsure, choose in_scope.\n\n" +
    "Conversation so far:\n" +
    recent;

  const label = await provider.classify(input, [...INTENT_LABELS]);
  return label === "in_scope";
}

// Layer 3: last net. The bot must never emit code; strip-and-refuse if it tries.
export function validateOutput(reply: string): string {
  if (reply.includes("```")) {
    return "I can only help with the clinic's dental services and appointments.";
  }
  return reply;
}
