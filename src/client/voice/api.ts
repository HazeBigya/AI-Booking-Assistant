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
