import { type ChatMessage } from "@server/sdk/ai/providers";
import { runChat } from "@server/sdk/ai/chat";
import { validateOutput } from "@server/sdk/ai/guardrails";
import { SYSTEM_PROMPT } from "@server/sdk/ai/prompt";
import type { ToolContext } from "@server/sdk/ai/tools";
import {
  getRecentChatMessages,
  linkPatientToSession,
  saveChatMessage,
} from "@server/db/queries/chat";
import { findOrCreatePatient } from "@server/auth/patients";
import { classifyFailure, describeFailure } from "@server/sdk/ai/providers/failure";
import { CLINIC } from "@server/domain/booking/rules";
import { formatZonedDate, formatZonedTime, zonedDateKey } from "@server/domain/booking/timezone";

// Recent messages sent to the model. Deliberately short: the durable state of a
// booking lives in Postgres, not in the transcript, so a fact from forty turns
// ago is re-read by a tool rather than remembered. That makes a longer window
// pure cost — more tokens per turn, and more text for a weak model to lose the
// auth line in. Tool results are not persisted, so this is 15 real exchanges.
const CONTEXT_WINDOW = 15;

export interface ChatReply {
  reply: string;
  totalTokens: number;
  authenticateAs?: string;
}

export interface ChatTurnOptions {
  authedEmail?: string;
  patientTimeZone?: string;
  spoken?: boolean; // the patient will hear this reply, not read it
}

// A reply that will be heard has to be written for the ear. The same table that
// reads well on screen becomes a list of numbers read aloud, and — because
// sentence-level chunking is what keeps speech latency down — a block with no
// sentence endings is also synthesised as one long request, so the patient
// waits through all of it before hearing a word. Both problems are the same
// problem, and both are fixed by asking for prose.
const SPOKEN_STYLE =
  `The patient is SPEAKING to you and will HEAR your reply — they are not reading it. ` +
  `Talk to them the way a good receptionist talks across the desk: plain sentences, no ` +
  `tables, no bullet points, no markdown, no headings. Say numbers as a person says them ` +
  `("fifty dollars", "an hour and a half", "quarter past two"). ` +
  `Answer as fully as the question deserves — a small question gets a sentence, and a real ` +
  `question like "what do you offer?" gets a proper answer covering everything they asked ` +
  `about, just spoken rather than tabulated. Do not clip a full answer down to a token one; ` +
  `a receptionist who says almost nothing sounds like she does not want to help. When a ` +
  `list really is long, walk through it naturally in prose and finish by asking what they ` +
  `would like to hear more about. This changes only how you speak — the tools you call and ` +
  `the facts you may state are exactly the same.`;

// Server-authoritative: history from the DB, guarded tool loop, turn persisted.
export async function handleChat(
  sessionId: string,
  userMessage: string,
  { authedEmail, patientTimeZone, spoken }: ChatTurnOptions = {},
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
    {
      role: "system",
      content:
        `${authLine}\n\n${SYSTEM_PROMPT}\n\n${currentDateLine(patientTimeZone)}\n${authLine}` +
        // Last, so recency works for it the way it does for the auth line.
        (spoken ? `\n\n${SPOKEN_STYLE}` : ""),
    },
    ...history,
    { role: "user", content: userMessage },
  ];
  // ctx is mutated by verify_login_code when the patient authenticates mid-chat.
  const ctx: ToolContext = { authedEmail, patientTimeZone };

  let reply: string;
  let totalTokens = 0;
  try {
    const result = await runChat(messages, ctx);
    reply = validateOutput(result.reply);
    totalTokens = result.totalTokens;
  } catch (err) {
    // One actionable line rather than a minified stack, and a reply that does
    // not promise a retry will help when it provably will not.
    console.error(describeFailure(process.env.AI_PROVIDER || "AI_PROVIDER (unset)", err));
    reply =
      classifyFailure(err).kind === "config"
        ? "I'm sorry — our booking assistant isn't set up correctly right now, so I can't " +
          "check the diary. Please call the clinic and we'll book you in directly."
        : "I'm sorry — I can't reach our booking assistant right now. Please try again in a moment.";
  }

  await saveChatMessage(sessionId, "user", userMessage);
  await saveChatMessage(sessionId, "assistant", reply, totalTokens);

  // Name is unknown at verify time; the email local part stands in until booking.
  const authenticateAs = ctx.authenticatedAs;
  if (authenticateAs) {
    const patient = await findOrCreatePatient(authenticateAs, authenticateAs.split("@")[0]);
    await linkPatientToSession(sessionId, patient.id);
  }

  return { reply, totalTokens, authenticateAs };
}

// The model needs the current TIME, not just the date, or it cannot tell that
// this morning's slots have already gone.
function currentDateLine(patientTimeZone?: string): string {
  const now = new Date();
  let line =
    `Right now at the clinic it is ${formatZonedTime(now, CLINIC.timeZone)} on ` +
    `${formatZonedDate(now, CLINIC.timeZone)} (${zonedDateKey(now, CLINIC.timeZone)}, ` +
    `clinic time zone ${CLINIC.timeZone}). Any time earlier than this today has ` +
    `already passed and cannot be booked.`;

  if (patientTimeZone && patientTimeZone !== CLINIC.timeZone) {
    line +=
      ` This patient is in ${patientTimeZone}, where it is currently ` +
      `${formatZonedTime(now, patientTimeZone)}. All appointment times you state are ` +
      `CLINIC times; when a tool result includes "yourLocalTime", mention it too so ` +
      `they know what the appointment is on their own clock.`;
  }
  return line;
}
