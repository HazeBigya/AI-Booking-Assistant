import { asc, desc, eq } from "drizzle-orm";
import { db } from "../client";
import { chatMessages, chatSessions } from "../schema";

export const CHAT_SESSION_COOKIE = "chat_session";

export interface StoredMessage {
  role: "user" | "assistant" | "tool";
  content: string;
}

// Returns an existing session id (if the cookie's session still exists) or
// creates a fresh one. The returned id is what the route stores in the cookie.
export async function getOrCreateChatSession(sessionId: string | undefined): Promise<string> {
  if (sessionId) {
    const rows = await db
      .select({ id: chatSessions.id })
      .from(chatSessions)
      .where(eq(chatSessions.id, sessionId))
      .limit(1);
    if (rows[0]) return rows[0].id;
  }
  const [created] = await db.insert(chatSessions).values({}).returning({ id: chatSessions.id });
  return created.id;
}

// Ties a chat session to a patient once they verify their email. Makes the
// `patient_id` column meaningful (who owns this conversation) instead of NULL.
export async function linkPatientToSession(sessionId: string, patientId: number): Promise<void> {
  await db.update(chatSessions).set({ patientId }).where(eq(chatSessions.id, sessionId));
}

export async function saveChatMessage(
  sessionId: string,
  role: StoredMessage["role"],
  content: string,
  tokens?: number,
): Promise<void> {
  await db.insert(chatMessages).values({ sessionId, role, content, tokens: tokens ?? null });
}

// Last `limit` messages, chronological. Used both to load the UI on refresh and
// to give the model recent context.
export async function getRecentChatMessages(
  sessionId: string,
  limit = 15,
): Promise<StoredMessage[]> {
  const rows = await db
    .select({ role: chatMessages.role, content: chatMessages.content })
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(limit);
  return rows.reverse().map((r) => ({ role: r.role as StoredMessage["role"], content: r.content }));
}

// All messages for a session, chronological — for loading the chat on page load.
export async function getChatHistory(sessionId: string): Promise<StoredMessage[]> {
  const rows = await db
    .select({ role: chatMessages.role, content: chatMessages.content })
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(asc(chatMessages.createdAt));
  return rows.map((r) => ({ role: r.role as StoredMessage["role"], content: r.content }));
}
