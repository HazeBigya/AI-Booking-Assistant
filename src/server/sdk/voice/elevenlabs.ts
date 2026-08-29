import type { SpokenAudio, TextToSpeech } from "./types";

// 'Rachel' — ElevenLabs' stock voice, present on every account, so the connector
// works before anyone has picked a voice.
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

export interface ElevenLabsConfig {
  apiKey: string;
  model: string;
  voice?: string; // a voice id from elevenlabs.io/app/voice-library
}

// Reached with fetch rather than an SDK: one endpoint, no dependency.
export function createElevenLabsTTS(cfg: ElevenLabsConfig): TextToSpeech {
  return {
    name: "elevenlabs",
    async speak(text: string, voice?: string): Promise<SpokenAudio> {
      const voiceId = voice ?? cfg.voice ?? DEFAULT_VOICE_ID;
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: "POST",
        headers: { "xi-api-key": cfg.apiKey, "content-type": "application/json" },
        body: JSON.stringify({ text, model_id: cfg.model }),
      });
      if (!res.ok) {
        throw new Error(`ElevenLabs TTS failed (${res.status}): ${await res.text()}`);
      }
      return { audio: new Uint8Array(await res.arrayBuffer()), mimeType: "audio/mpeg" };
    },
  };
}
