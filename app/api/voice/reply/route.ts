import { NextResponse, type NextRequest } from "next/server";
import { chatController } from "@server/controllers/chat-controller";
import { SESSION_COOKIE, createSessionToken } from "@server/auth/session";
import { readVerifiedSession } from "@server/auth/verified-session";
import { CHAT_SESSION_COOKIE } from "@server/db/queries/chat";
import { A_MONTH, A_WEEK, sessionCookie } from "@server/shared/cookies";
import { getTextToSpeech } from "@server/sdk/voice";
import { toSpeakable } from "@shared/speakable";

// The voice turn in one request. The old path made the browser fetch the reply
// text, then fire a separate TTS call per sentence — so the text landed on
// screen and the voice arrived a beat later, and the patient sat reading a reply
// they could not yet hear. Here the server runs the exact same guarded chat turn
// (chatController -> the reply is already validated before a word is synthesised),
// then chunks it and streams each sentence's TEXT and AUDIO together as one
// NDJSON line. The browser reveals each sentence as it plays it, so text and
// voice arrive together. Typed chat still uses /api/chat unchanged.
//
// Line shapes (newline-delimited JSON):
//   {"type":"chunk","index":0,"text":"...","audio":"<base64 mp3>","mime":"audio/mpeg"}
//   {"type":"chunk","index":1,"text":"...","error":true}   // synthesis failed; show the text, no audio
//   {"type":"done"}
export async function POST(req: NextRequest) {
  const clientKey = req.headers.get("x-forwarded-for") ?? "local";
  const sessionToken = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await readVerifiedSession(sessionToken);
  const chatSessionId = req.cookies.get(CHAT_SESSION_COOKIE)?.value;

  let payload: unknown = null;
  try {
    payload = await req.json();
  } catch {
    payload = null;
  }

  // spoken is forced here, not trusted from the client: this endpoint only ever
  // produces a reply that will be heard, so it always gets the spoken style.
  const result = await chatController({
    clientKey,
    payload: { ...(typeof payload === "object" && payload ? payload : {}), spoken: true },
    authedEmail: session?.email,
    chatSessionId,
  });

  // Rate-limited / bad input / server error: no audio to stream, hand the browser
  // the same JSON error the chat route would, and let it fall back to text.
  if (result.status !== 200 || typeof (result.body as { reply?: unknown })?.reply !== "string") {
    return NextResponse.json(result.body, { status: result.status });
  }
  const reply = (result.body as { reply: string }).reply;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      let tts;
      try {
        tts = getTextToSpeech();
      } catch {
        // Voice not configured after all — still deliver the words so the reply
        // is never lost, just without sound.
        emit({ type: "chunk", index: 0, text: reply, error: true });
        emit({ type: "done" });
        controller.close();
        return;
      }

      const chunks = toSpeakable(reply);
      // Synthesised in order so the browser can play them in order; sentence i+1
      // is already being made while the browser plays sentence i.
      for (let i = 0; i < chunks.length; i++) {
        try {
          const { audio, mimeType } = await tts.speak(chunks[i]);
          emit({
            type: "chunk",
            index: i,
            text: chunks[i],
            audio: Buffer.from(audio).toString("base64"),
            mime: mimeType,
          });
        } catch (err) {
          // One dead sentence must not lose the rest of the reply. Send the text
          // so it still appears; the browser skips the missing audio.
          console.error("voice reply chunk failed:", err);
          emit({ type: "chunk", index: i, text: chunks[i], error: true });
        }
      }
      emit({ type: "done" });
      controller.close();
    },
  });

  const res = new NextResponse(stream, {
    status: 200,
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    },
  });

  // Same cookie handling as /api/chat: a stale token is cleared, the chat
  // session is persisted, and an in-chat verification opens an auth session.
  if (sessionToken && !session && !result.authenticateAs) {
    res.cookies.delete(SESSION_COOKIE);
  }
  if (result.chatSessionId) {
    res.cookies.set(CHAT_SESSION_COOKIE, result.chatSessionId, sessionCookie(A_MONTH));
  }
  if (result.authenticateAs) {
    const token = await createSessionToken({
      email: result.authenticateAs,
      name: result.authenticateAs.split("@")[0],
    });
    res.cookies.set(SESSION_COOKIE, token, sessionCookie(A_WEEK));
  }

  return res;
}
