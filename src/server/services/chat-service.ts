import { type ChatMessage } from "@server/sdk/ai/providers";
import { runChat } from "@server/sdk/ai/chat";
import { validateOutput } from "@server/sdk/ai/guardrails";
import { SYSTEM_PROMPT } from "@server/sdk/ai/prompt";
import type { ToolContext } from "@server/sdk/ai/tools";
import { getRecentChatMessages, saveChatMessage } from "@server/db/queries/chat";

const CONTEXT_WINDOW = 15; // recent messages sent to the model

export interface ChatReply {
  reply: string;
  totalTokens: number;
  // Set when the patient verified their email this turn — the route persists a
  // session cookie for this address.
  authenticateAs?: string;
}

// Server-authoritative chat: loads recent history from the DB, runs the guarded
// tool loop, and persists both the user message and the reply (with token usage).
// Guardrails: strict system prompt, tools-only actions, output validator.
export async function handleChat(
  sessionId: string,
  userMessage: string,
  authedEmail?: string,
): Promise<ChatReply> {
  const authLine = authedEmail
    ? `The patient is logged in as ${authedEmail}; booking and get_my_appointments use this identity.`
    : `The patient is NOT logged in. To book or view appointments, verify their email first ` +
      `(collect email -> request_login_code -> ask for the code -> verify_login_code).`;

  const history = await getRecentChatMessages(sessionId, CONTEXT_WINDOW);
  const messages: ChatMessage[] = [
    { role: "system", content: `${SYSTEM_PROMPT}\n\n${currentDateLine()}\n${authLine}` },
    ...history,
    { role: "user", content: userMessage },
  ];
  // ctx is mutated by verify_login_code when the patient authenticates mid-chat.
  const ctx: ToolContext = { authedEmail };

  let reply: string;
  let totalTokens = 0;
  try {
    const result = await runChat(messages, ctx);
    reply = validateOutput(result.reply);
    totalTokens = result.totalTokens;
  } catch (err) {
    // Every LLM provider in the chain failed — be honest, don't crash.
    console.error("all LLM providers failed:", err);
    reply = "I'm sorry — I can't reach our booking assistant right now. Please try again in a moment.";
  }

  // Persist the turn (user first for chronological order, then the reply + tokens).
  await saveChatMessage(sessionId, "user", userMessage);
  await saveChatMessage(sessionId, "assistant", reply, totalTokens);

  return { reply, totalTokens, authenticateAs: ctx.authenticatedAs };
}

// Clinic time is UTC by our simplification, so read the date in UTC.
function currentDateLine(): string {
  const now = new Date();
  const iso = now.toISOString().slice(0, 10);
  const weekday = now.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  return `The current date is ${iso} (${weekday}).`;
}
