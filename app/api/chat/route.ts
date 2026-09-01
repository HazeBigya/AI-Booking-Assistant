import { NextResponse, type NextRequest } from "next/server";
import { chatController } from "@server/controllers/chat-controller";
import { SESSION_COOKIE, createSessionToken } from "@server/auth/session";
import { readVerifiedSession } from "@server/auth/verified-session";
import { CHAT_SESSION_COOKIE } from "@server/db/queries/chat";
import { A_MONTH, A_WEEK, sessionCookie } from "@server/shared/cookies";

export async function POST(req: NextRequest) {
  const clientKey = req.headers.get("x-forwarded-for") ?? "local";
  const sessionToken = req.cookies.get(SESSION_COOKIE)?.value;
  // Verified against the patients table, not just the signature, so a token that
  // outlived its patient row does not make the model treat someone as logged in.
  const session = await readVerifiedSession(sessionToken);
  const chatSessionId = req.cookies.get(CHAT_SESSION_COOKIE)?.value;

  let payload: unknown = null;
  try {
    payload = await req.json();
  } catch {
    payload = null;
  }

  const result = await chatController({
    clientKey,
    payload,
    authedEmail: session?.email,
    chatSessionId,
  });

  const res = NextResponse.json(result.body, { status: result.status });

  // Stale token: signed by us, but the patient it names is gone.
  if (sessionToken && !session && !result.authenticateAs) {
    res.cookies.delete(SESSION_COOKIE);
  }

  // Persist the chat session (anonymous conversation identity) so refresh keeps history.
  if (result.chatSessionId) {
    res.cookies.set(CHAT_SESSION_COOKIE, result.chatSessionId, sessionCookie(A_MONTH));
  }

  // Patient verified their email in-chat this turn -> persist the auth session.
  if (result.authenticateAs) {
    const token = await createSessionToken({
      email: result.authenticateAs,
      name: result.authenticateAs.split("@")[0],
    });
    res.cookies.set(SESSION_COOKIE, token, sessionCookie(A_WEEK));
  }

  return res;
}
