import { handleChat } from "@server/services/chat-service";
import type { ChatMessage } from "@server/sdk/ai/providers";
import { rateLimit } from "@server/shared/rate-limit";

export interface ControllerResult {
  status: number;
  body: unknown;
}

// Thin: rate-limit, validate input, delegate to the service, shape the response.
// No business logic lives here.
export async function chatController(input: {
  clientKey: string;
  payload: unknown;
  authedEmail?: string;
}): Promise<ControllerResult> {
  if (!rateLimit(input.clientKey).allowed) {
    return { status: 429, body: { error: "Too many requests. Please slow down." } };
  }

  const messages = parseMessages(input.payload);
  if (!messages) {
    return { status: 400, body: { error: "Invalid request: expected { messages: [...] }." } };
  }

  try {
    const { reply, totalTokens } = await handleChat(messages, input.authedEmail);
    return { status: 200, body: { reply, totalTokens } };
  } catch (err) {
    console.error("chat error:", err);
    return { status: 500, body: { error: "Something went wrong. Please try again." } };
  }
}

function parseMessages(payload: unknown): ChatMessage[] | null {
  if (typeof payload !== "object" || payload === null) return null;
  const raw = (payload as { messages?: unknown }).messages;
  if (!Array.isArray(raw)) return null;

  const messages: ChatMessage[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) return null;
    const { role, content } = item as { role?: unknown; content?: unknown };
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") return null;
    messages.push({ role, content });
  }
  return messages;
}
