import { NextResponse, type NextRequest } from "next/server";
import { chatController } from "@server/controllers/chat-controller";
import { SESSION_COOKIE, createSessionToken, readSessionToken } from "@server/auth/session";

export async function POST(req: NextRequest) {
  const clientKey = req.headers.get("x-forwarded-for") ?? "local";
  const session = await readSessionToken(req.cookies.get(SESSION_COOKIE)?.value);

  let payload: unknown = null;
  try {
    payload = await req.json();
  } catch {
    payload = null;
  }

  const { status, body, authenticateAs } = await chatController({
    clientKey,
    payload,
    authedEmail: session?.email,
  });

  const res = NextResponse.json(body, { status });
  // Patient verified their email in-chat this turn -> persist the session.
  if (authenticateAs) {
    const token = await createSessionToken({
      email: authenticateAs,
      name: authenticateAs.split("@")[0],
    });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
  }
  return res;
}
