import { and, count, eq, gte } from "drizzle-orm";
import { db } from "../client";
import { chatMessages, chatSessions, patients } from "../schema";
import { USAGE_WINDOW_MS, type UsageCounts } from "@server/domain/usage/limits";

// Only 'user' rows are counted. One patient message is one turn the clinic pays
// for, whereas assistant and tool rows vary with how many tools the model
// happened to call — counting those would punish a patient for the model being
// indecisive.
const USER_MESSAGES = eq(chatMessages.role, "user");

/**
 * Counts for the last 24 hours, read from the messages already stored. There is
 * no separate counter table on purpose: a counter can drift from reality, and
 * an in-memory one silently resets every time the container restarts, which
 * would hand an attacker a fresh budget on each restart.
 */
export async function getUsageCounts(
  sessionId: string,
  authedEmail?: string,
): Promise<UsageCounts> {
  const since = new Date(Date.now() - USAGE_WINDOW_MS);

  // A verified patient is capped on their identity, so their own session count
  // is not needed and the query is skipped.
  if (authedEmail) {
    const rows = await db
      .select({ n: count() })
      .from(chatMessages)
      .innerJoin(chatSessions, eq(chatMessages.sessionId, chatSessions.id))
      .innerJoin(patients, eq(chatSessions.patientId, patients.id))
      // Counted across every session they have used, so opening a new tab does
      // not reset their day.
      .where(
        and(eq(patients.email, authedEmail), USER_MESSAGES, gte(chatMessages.createdAt, since)),
      );
    return { session: 0, patient: rows[0]?.n ?? 0 };
  }

  const rows = await db
    .select({ n: count() })
    .from(chatMessages)
    .where(
      and(eq(chatMessages.sessionId, sessionId), USER_MESSAGES, gte(chatMessages.createdAt, since)),
    );
  return { session: rows[0]?.n ?? 0 };
}
