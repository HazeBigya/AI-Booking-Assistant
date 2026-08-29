import { NextResponse, type NextRequest } from "next/server";
import { getTextToSpeech } from "@server/sdk/voice";

// One sentence at a time. Anything longer is not a chunk, it is a whole reply,
// which is the latency problem the chunking exists to avoid.
const MAX_CHARS = 1200;

export async function POST(req: NextRequest) {
  let tts;
  try {
    tts = getTextToSpeech();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => null)) as { text?: unknown; voice?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "No text to speak." }, { status: 400 });
  if (text.length > MAX_CHARS) {
    return NextResponse.json({ error: "Text too long to speak." }, { status: 413 });
  }

  try {
    const { audio, mimeType } = await tts.speak(
      text,
      typeof body?.voice === "string" ? body.voice : undefined,
    );
    return new Response(audio as unknown as BodyInit, {
      status: 200,
      headers: { "content-type": mimeType, "cache-control": "no-store" },
    });
  } catch (err) {
    console.error("speak failed:", err);
    return NextResponse.json({ error: "Could not generate speech." }, { status: 502 });
  }
}
