import { NextResponse, type NextRequest } from "next/server";
import { chatController } from "@server/controllers/chat-controller";
import { SESSION_COOKIE, createSessionToken, readSessionToken } from "@server/auth/session";
import { CHAT_SESSION_COOKIE } from "@server/db/queries/chat";
import { A_MONTH, A_WEEK, sessionCookie } from "@server/shared/cookies";

export async function POST(req: NextRequest) {
  const clientKey = req.headers.get("x-forwarded-for") ?? "local";
  const session = await readSessionToken(req.cookies.get(SESSION_COOKIE)?.value);
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
