import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@server/auth/session";
import { readVerifiedSession } from "@server/auth/verified-session";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await readVerifiedSession(token);

  const res = NextResponse.json({ session });

  // The token was signed by us but the patient is gone — the database was wiped
  // or restored from an older backup. Clear the cookie rather than leaving the
  // browser to send a token that will be refused on every request from now on.
  if (token && !session) {
    res.cookies.delete(SESSION_COOKIE);
  }
  return res;
}
