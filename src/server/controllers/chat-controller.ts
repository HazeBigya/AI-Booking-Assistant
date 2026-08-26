import { handleChat } from "@server/services/chat-service";
import { getOrCreateChatSession } from "@server/db/queries/chat";
import { rateLimit } from "@server/shared/rate-limit";

export interface ControllerResult {
  status: number;
  body: unknown;
  authenticateAs?: string; // route sets the auth session cookie for this email
  chatSessionId?: string; // route sets the chat-session cookie
}

// Thin: rate-limit, validate input, resolve the chat session, delegate.
export async function chatController(input: {
  clientKey: string;
  payload: unknown;
  authedEmail?: string;
  chatSessionId?: string;
}): Promise<ControllerResult> {
  if (!rateLimit(input.clientKey).allowed) {
    return { status: 429, body: { error: "Too many requests. Please slow down." } };
  }

  const message = parseMessage(input.payload);
  if (!message) {
    return { status: 400, body: { error: "Invalid request: expected { message: string }." } };
  }

  const sessionId = await getOrCreateChatSession(input.chatSessionId);

  try {
    const { reply, totalTokens, authenticateAs } = await handleChat(
      sessionId,
      message,
      input.authedEmail,
      parseTimeZone(input.payload),
    );
    return { status: 200, body: { reply, totalTokens }, authenticateAs, chatSessionId: sessionId };
  } catch (err) {
    console.error("chat error:", err);
    return { status: 500, body: { error: "Something went wrong. Please try again." } };
  }
}

function parseMessage(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const { message } = payload as { message?: unknown };
  if (typeof message !== "string" || message.trim() === "") return null;
  return message;
}

// Client input: validated against the platform's tz database before use.
export function parseTimeZone(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null) return undefined;
  const { timeZone } = payload as { timeZone?: unknown };
  if (typeof timeZone !== "string" || timeZone.trim() === "") return undefined;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return undefined; // unknown zone — ignore rather than fail the turn
  }
}
