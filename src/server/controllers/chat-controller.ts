import { handleChat } from "@server/services/chat-service";
import { getOrCreateChatSession } from "@server/db/queries/chat";
import { getUsageCounts } from "@server/db/queries/usage";
import { checkUsage } from "@server/domain/usage/limits";
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

  // The per-minute limit above stops a burst; this stops a slow drip that runs
  // all day. Checked before the model is called, so a blocked turn costs the
  // clinic nothing at the AI provider.
  const usage = checkUsage(await getUsageCounts(sessionId, input.authedEmail));
  if (!usage.allowed) {
    console.warn(`[usage] blocked by the ${usage.scope} daily cap (session ${sessionId})`);
    // 200, not 429: this is a real answer for the patient to read, not an error
    // for the browser to retry. The conversation continues; this turn does not
    // reach the model.
    return {
      status: 200,
      body: { reply: usage.message, totalTokens: 0 },
      chatSessionId: sessionId,
    };
  }

  try {
    const { reply, totalTokens, authenticateAs } = await handleChat(sessionId, message, {
      authedEmail: input.authedEmail,
      patientTimeZone: parseTimeZone(input.payload),
      spoken: parseSpoken(input.payload),
    });
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

// Only ever a style hint. A caller who lies about this gets prose instead of a
// table and nothing else: it reaches the system prompt, never the tool layer,
// so it cannot widen what the model is allowed to do or say.
export function parseSpoken(payload: unknown): boolean {
  if (typeof payload !== "object" || payload === null) return false;
  return (payload as { spoken?: unknown }).spoken === true;
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
