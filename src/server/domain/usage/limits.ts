// Daily caps on how much a caller can spend of the clinic's AI budget.
//
// rate-limit.ts stops a burst (20 a minute). It does not stop a slow drip: at
// that rate an automated caller reaches ~28,800 messages a day, which is ~256
// million tokens, which is real money. These caps bound the day.
//
// The numbers are derived from this product's own measured behaviour, not from
// an industry standard — there is no standard for "messages per day to a
// booking assistant". What vendors actually limit is tokens per minute, because
// tokens are the cost. A cap must never interrupt a real patient, so each one
// sits above what the measured conversation needs:
//
//   a complete booking          6-8 messages
//   browse, ask, then decide    10-20 messages
//
// Hardcoded rather than configurable. A limit nobody can change is a limit
// nobody can quietly raise to make an alert go away.

/** One anonymous chat session. */
export const ANON_MESSAGES_PER_DAY = 30;

/** One verified patient, across every device they use. */
export const PATIENT_MESSAGES_PER_DAY = 100;

/** A rolling window, so there is no midnight moment when every cap resets. */
export const USAGE_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface UsageCounts {
  /** Messages from this chat session in the window. */
  session: number;
  /** Messages from this patient across all their sessions. Absent if not verified. */
  patient?: number;
}

export type UsageVerdict =
  | { allowed: true }
  | { allowed: false; scope: "session" | "patient"; message: string };

// A patient who reaches a cap has done nothing wrong, so the reply points them
// at a human. It names no number and does not say "limit": a message that
// announces the cap tells an attacker exactly what they have to work around.
const OVER_SESSION =
  "I've answered a lot of questions in this conversation. Please call the clinic " +
  "and the team will help you directly.";
const OVER_PATIENT =
  "You've reached the number of messages I can handle in a day. Please call the " +
  "clinic and the team will help you directly.";

/** Pure: given the counts, decide. */
export function checkUsage(counts: UsageCounts): UsageVerdict {
  if (counts.patient !== undefined) {
    // A verified patient is capped on their identity, which is signed and
    // cannot be forged, so this is the cap that really holds.
    if (counts.patient >= PATIENT_MESSAGES_PER_DAY) {
      return { allowed: false, scope: "patient", message: OVER_PATIENT };
    }
    return { allowed: true };
  }
  // Anonymous: keyed on the chat-session cookie. Someone who clears the cookie
  // gets a fresh 30, so this stops mistakes and casual abuse rather than a
  // determined script. See section 6 of the internal documentation.
  if (counts.session >= ANON_MESSAGES_PER_DAY) {
    return { allowed: false, scope: "session", message: OVER_SESSION };
  }
  return { allowed: true };
}
