export interface VoiceConfig {
  stt: boolean;
  tts: boolean;
  reason?: string;
}

export async function getVoiceConfig(): Promise<VoiceConfig> {
  const res = await fetch("/api/voice/config");
  if (!res.ok) return { stt: false, tts: false, reason: "Voice unavailable." };
  return (await res.json()) as VoiceConfig;
}

export async function transcribe(blob: Blob): Promise<string> {
  const body = new FormData();
  body.append("audio", blob, "turn.webm");
  const res = await fetch("/api/voice/transcribe", { method: "POST", body });
  const json = (await res.json()) as { text?: string; error?: string };
  if (!res.ok) throw new Error(json.error ?? "Could not transcribe that.");
  return json.text ?? "";
}

// One sentence of the reply: its text, and its audio if synthesis succeeded.
export interface VoiceChunk {
  index: number;
  text: string;
  audio?: Blob; // absent when the server could not synthesise this sentence
}

// The whole voice turn in one request. The server runs the guarded chat turn and
// streams each sentence's text and audio together (NDJSON), so the browser can
// reveal each sentence as it plays it instead of showing the whole reply and
// then waiting on separate TTS calls. onChunk fires once per sentence, in order.
// Throws on a non-streaming failure (rate limit, bad input) so the caller can
// fall back to showing an error.
export async function voiceReply(
  message: string,
  onChunk: (chunk: VoiceChunk) => void,
): Promise<void> {
  const res = await fetch("/api/voice/reply", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, timeZone: browserTimeZone() }),
  });
  if (!res.ok || !res.body) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(json.error ?? "Could not reach the booking assistant.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      const msg = JSON.parse(line) as
        | { type: "chunk"; index: number; text: string; audio?: string; mime?: string }
        | { type: "done" };
      if (msg.type === "done") return;
      onChunk({
        index: msg.index,
        text: msg.text,
        audio: msg.audio && msg.mime ? base64ToBlob(msg.audio, msg.mime) : undefined,
      });
    }
  }
}

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function browserTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

export async function speak(text: string): Promise<Blob> {
  const res = await fetch("/api/voice/speak", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(json.error ?? "Could not generate speech.");
  }
  return await res.blob();
}
