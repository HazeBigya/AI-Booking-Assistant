import { NextResponse, type NextRequest } from "next/server";
import { chatController } from "@server/controllers/chat-controller";
import { SESSION_COOKIE, readSessionToken } from "@server/auth/session";

export async function POST(req: NextRequest) {
  const clientKey = req.headers.get("x-forwarded-for") ?? "local";
  const session = await readSessionToken(req.cookies.get(SESSION_COOKIE)?.value);

  let payload: unknown = null;
  try {
    payload = await req.json();
  } catch {
    payload = null;
  }

  const { status, body } = await chatController({
    clientKey,
    payload,
    authedEmail: session?.email,
  });
  return NextResponse.json(body, { status });
}
