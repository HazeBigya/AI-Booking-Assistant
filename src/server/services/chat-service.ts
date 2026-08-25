import { type ChatMessage } from "@server/sdk/ai/providers";
import { runChat } from "@server/sdk/ai/chat";
import { validateOutput } from "@server/sdk/ai/guardrails";
import { SYSTEM_PROMPT } from "@server/sdk/ai/prompt";
import type { ToolContext } from "@server/sdk/ai/tools";
import { getRecentChatMessages, linkPatientToSession, saveChatMessage } from "@server/db/queries/chat";
import { findOrCreatePatient } from "@server/auth/patients";

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
    ? `The patient is ALREADY logged in and verified as ${authedEmail}. Treat them as ` +
      `authenticated: book and show appointments DIRECTLY using this identity. Do NOT ask ` +
      `for their email and do NOT run the login/OTP flow (request_login_code / ` +
      `verify_login_code) again — they are already verified.`
    : `The patient is NOT logged in. To book or view appointments, verify their email first ` +
      `(collect email -> request_login_code -> ask for the code -> verify_login_code).`;

  const history = await getRecentChatMessages(sessionId, CONTEXT_WINDOW);
  // Auth status is placed FIRST (primacy) and LAST (recency) so a weak model is
  // far less likely to overlook that the patient is already logged in.
  const messages: ChatMessage[] = [
    { role: "system", content: `${authLine}\n\n${SYSTEM_PROMPT}\n\n${currentDateLine()}\n${authLine}` },
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

  // If they verified their email this turn, tie this conversation to that
  // patient. Name is unknown at verify time; use the email local part as a
  // placeholder (a real name is captured at booking). find-or-create is safe
  // whether or not the patient already exists.
  const authenticateAs = ctx.authenticatedAs;
  if (authenticateAs) {
    const patient = await findOrCreatePatient(authenticateAs, authenticateAs.split("@")[0]);
    await linkPatientToSession(sessionId, patient.id);
  }

  return { reply, totalTokens, authenticateAs };
}

// Clinic time is UTC by our simplification, so read the date in UTC.
function currentDateLine(): string {
  const now = new Date();
  const iso = now.toISOString().slice(0, 10);
  const weekday = now.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  return `The current date is ${iso} (${weekday}).`;
}
