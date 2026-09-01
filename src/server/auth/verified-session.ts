import { readSessionToken, type Session } from "./session";
import { patientExists } from "./patients";

/**
 * A signed token proves the patient verified their email at some point. It does
 * not prove the clinic still has them: the token is self-contained and lives for
 * 7 days, so it outlives `npm run destroy` and any restore from an older backup.
 *
 * The lookup is injected so this can be tested without a database, the same way
 * the booking rules declare what they need instead of importing it.
 */
export async function verifySession(
  token: string | undefined,
  exists: (email: string) => Promise<boolean>,
): Promise<Session | null> {
  const session = await readSessionToken(token);
  if (!session) return null;
  return (await exists(session.email)) ? session : null;
}

/** The same check, wired to the real patients table. */
export function readVerifiedSession(token: string | undefined): Promise<Session | null> {
  return verifySession(token, patientExists);
}
