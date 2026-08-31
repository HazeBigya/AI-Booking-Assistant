import { httpFailure } from "./failure";
import { extensionFor } from "./mime";
import { ELEVENLABS_VOICE_ID, ELEVENLABS_VOICE_SETTINGS } from "./persona";
import type { SpeechToText, SpokenAudio, TextToSpeech } from "./types";

export interface ElevenLabsConfig {
  apiKey: string;
  model: string;
}

// Reached with fetch rather than an SDK: one endpoint, no dependency.
export function createElevenLabsTTS(cfg: ElevenLabsConfig): TextToSpeech {
  return {
    name: "elevenlabs",
    async speak(text: string): Promise<SpokenAudio> {
      const res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
        {
          method: "POST",
          headers: { "xi-api-key": cfg.apiKey, "content-type": "application/json" },
          body: JSON.stringify({
            text,
            model_id: cfg.model,
            voice_settings: ELEVENLABS_VOICE_SETTINGS,
          }),
        },
      );
      if (!res.ok) throw await httpFailure("ElevenLabs TTS", res);
      return { audio: new Uint8Array(await res.arrayBuffer()), mimeType: "audio/mpeg" };
    },
  };
}

// Scribe. Priced and billed separately from the voices, so using it does not
// oblige anyone to buy TTS from the same vendor — VOICE_STT_PROVIDER and
// VOICE_TTS_PROVIDER stay independent.
export function createElevenLabsSTT(cfg: ElevenLabsConfig): SpeechToText {
  return {
    name: "elevenlabs",
    async transcribe(audio: Uint8Array, mimeType: string): Promise<string> {
      // multipart, unlike the JSON body TTS takes. The extension carries the
      // codec, since the browser's mime is all we know about the recording.
      const form = new FormData();
      form.append("model_id", cfg.model);
      form.append(
        "file",
        new Blob([audio as unknown as BlobPart], { type: mimeType }),
        `audio.${extensionFor(mimeType)}`,
      );

      const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
        method: "POST",
        // No content-type header: fetch must set it to include the multipart
        // boundary, and naming it here would produce a body the API cannot split.
        headers: { "xi-api-key": cfg.apiKey },
        body: form,
      });
      if (!res.ok) throw await httpFailure("ElevenLabs STT", res);
      const json = (await res.json()) as { text?: string };
      return (json.text ?? "").trim();
    },
  };
}
