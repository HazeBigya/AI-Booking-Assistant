import { NextResponse, type NextRequest } from "next/server";
import { getSpeechToText } from "@server/sdk/voice";

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

  // The bytes are transcribed and dropped. The transcript is persisted by the
  // chat route as an ordinary message, which is the whole record of the turn —
  // keeping the audio too would mean holding a patient's voice with no
  // retention window and nothing in the product that ever reads it back.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = file.type || "audio/webm";

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
