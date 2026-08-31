import { httpFailure } from "./failure";
import type { SpeechToText, SpokenAudio, TextToSpeech } from "./types";

export interface DeepgramConfig {
  apiKey: string;
  model: string;
}

export function createDeepgramSTT(cfg: DeepgramConfig): SpeechToText {
  return {
    name: "deepgram",
    async transcribe(audio: Uint8Array, mimeType: string): Promise<string> {
      const url = `https://api.deepgram.com/v1/listen?model=${encodeURIComponent(cfg.model)}&smart_format=true`;
      const res = await fetch(url, {
        method: "POST",
        headers: { authorization: `Token ${cfg.apiKey}`, "content-type": mimeType },
        body: audio as unknown as BodyInit, // raw bytes, not multipart
      });
      if (!res.ok) throw await httpFailure("Deepgram STT", res);
      const json = (await res.json()) as {
        results?: { channels?: { alternatives?: { transcript?: string }[] }[] };
      };
      return (json.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "").trim();
    },
  };
}

export function createDeepgramTTS(cfg: DeepgramConfig): TextToSpeech {
  return {
    name: "deepgram",
    async speak(text: string): Promise<SpokenAudio> {
      const url = `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(cfg.model)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { authorization: `Token ${cfg.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw await httpFailure("Deepgram TTS", res);
      return { audio: new Uint8Array(await res.arrayBuffer()), mimeType: "audio/mpeg" };
    },
  };
}
