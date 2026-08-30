import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@server/auth/session";
import { sessionCookie } from "@server/shared/cookies";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  // Same flags as when it was set, or the browser treats it as a different
  // cookie and leaves the original in place.
  res.cookies.set(SESSION_COOKIE, "", sessionCookie(0));
  return res;
}
