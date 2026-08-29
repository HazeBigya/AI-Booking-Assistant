import { NextResponse, type NextRequest } from "next/server";
import { CHAT_SESSION_COOKIE } from "@server/db/queries/chat";
import { getSpeechToText } from "@server/sdk/voice";
import { getVoiceStore } from "@server/sdk/voice/store";

// A minute of opus is roughly 250 KB; anything past this is not a spoken turn.
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  let stt;
  try {
    stt = getSpeechToText();
  } catch (err) {
    // Not configured is a 503 with the fix in it, not a generic failure.
    return NextResponse.json({ error: message(err) }, { status: 503 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("audio");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "No audio uploaded." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "Empty recording." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Recording too long." }, { status: 413 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = file.type || "audio/webm";

  // Fire and forget: a debug artifact must not delay or fail the patient's turn.
  const sessionId = req.cookies.get(CHAT_SESSION_COOKIE)?.value ?? "anonymous";
  void getVoiceStore().save(sessionId, bytes, mimeType);

  try {
    const text = await stt.transcribe(bytes, mimeType);
    return NextResponse.json({ text });
  } catch (err) {
    console.error("transcribe failed:", err);
    return NextResponse.json({ error: "Could not transcribe that." }, { status: 502 });
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
