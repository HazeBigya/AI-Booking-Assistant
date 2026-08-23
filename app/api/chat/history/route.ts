import { NextResponse, type NextRequest } from "next/server";
import { CHAT_SESSION_COOKIE, getChatHistory } from "@server/db/queries/chat";

export async function GET(req: NextRequest) {
  const sessionId = req.cookies.get(CHAT_SESSION_COOKIE)?.value;
  if (!sessionId) return NextResponse.json({ messages: [] });

  const messages = await getChatHistory(sessionId);
  // Only user/assistant turns are shown in the UI (tool messages are internal).
  return NextResponse.json({
    messages: messages.filter((m) => m.role === "user" || m.role === "assistant"),
  });
}
