import { type ChatMessage } from "@server/sdk/ai/providers";
import { runChat } from "@server/sdk/ai/chat";
import { validateOutput } from "@server/sdk/ai/guardrails";
import { SYSTEM_PROMPT } from "@server/sdk/ai/prompt";
import type { ToolContext } from "@server/sdk/ai/tools";

export interface ChatReply {
  reply: string;
  totalTokens: number;
  // Set when the patient verified their email this turn — the route persists a
  // session cookie for this address.
  authenticateAs?: string;
}

// Guardrails around the tool-calling loop:
//   [1] strict system prompt — the main model refuses off-topic reliably
//   [2] tools are the only way to act (no free-form actions)
//   [3] output validator
// A pre-call intent gate (guardrails.isInScope) exists as an optional stricter
// layer, but it's kept off the hot path: with a lightweight classifier it
// produced false rejections of valid booking requests. Enable it behind a
// stronger classifier model.
export async function handleChat(
  history: ChatMessage[],
  authedEmail?: string,
): Promise<ChatReply> {
  const authLine = authedEmail
    ? `The patient is logged in as ${authedEmail}; booking and get_my_appointments use this identity.`
    : `The patient is NOT logged in. To book or view appointments, verify their email first ` +
      `(collect email -> request_login_code -> ask for the code -> verify_login_code).`;

  const messages: ChatMessage[] = [
    { role: "system", content: `${SYSTEM_PROMPT}\n\n${currentDateLine()}\n${authLine}` },
    ...history,
  ];
  // ctx is mutated by verify_login_code when the patient authenticates mid-chat.
  const ctx: ToolContext = { authedEmail };
  const result = await runChat(messages, ctx);

  return {
    reply: validateOutput(result.reply),
    totalTokens: result.totalTokens,
    authenticateAs: ctx.authenticatedAs,
  };
}

// Clinic time is UTC by our simplification, so read the date in UTC.
function currentDateLine(): string {
  const now = new Date();
  const iso = now.toISOString().slice(0, 10);
  const weekday = now.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  return `The current date is ${iso} (${weekday}).`;
}
