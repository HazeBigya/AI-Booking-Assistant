import { NextResponse, type NextRequest } from "next/server";
import { getTextToSpeech } from "@server/sdk/voice";
import { configFailure } from "@server/sdk/voice/failure";

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

  const body = (await req.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "No text to speak." }, { status: 400 });
  if (text.length > MAX_CHARS) {
    return NextResponse.json({ error: "Text too long to speak." }, { status: 413 });
  }

  try {
    const { audio, mimeType } = await tts.speak(text);
    return new Response(audio as unknown as BodyInit, {
      status: 200,
      headers: { "content-type": mimeType, "cache-control": "no-store" },
    });
  } catch (err) {
    console.error("speak failed:", err);
    // A plan restriction or a bad key reads the same on every attempt, so the
    // vendor's sentence is worth more than a retry suggestion. Anything that
    // might be transient keeps the generic line.
    const settings = configFailure(err);
    return NextResponse.json(
      { error: settings ?? "Could not generate speech." },
      { status: settings ? 503 : 502 },
    );
  }
}
