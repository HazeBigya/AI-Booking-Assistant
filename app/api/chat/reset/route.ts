import { NextResponse } from "next/server";
import { CHAT_SESSION_COOKIE } from "@server/db/queries/chat";
import { sessionCookie } from "@server/shared/cookies";

// Start a fresh conversation: clear the chat-session cookie so the next message
// creates a new session. The login session cookie is left intact — resetting the
// chat does not log the patient out.
export async function POST() {
  const res = NextResponse.json({ ok: true });
  // maxAge 0 expires it; the flags must still match or some browsers keep it.
  res.cookies.set(CHAT_SESSION_COOKIE, "", sessionCookie(0));
  return res;
}
