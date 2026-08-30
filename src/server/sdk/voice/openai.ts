import OpenAI, { toFile } from "openai";
import { extensionFor } from "./mime";
import type { SpeechToText, SpokenAudio, TextToSpeech } from "./types";

export interface OpenAIVoiceConfig {
  apiKey: string;
  model: string;
  voice?: string; // TTS only
}

export function createOpenAISTT(cfg: OpenAIVoiceConfig): SpeechToText {
  const client = new OpenAI({ apiKey: cfg.apiKey });
  return {
    name: "openai",
    async transcribe(audio: Uint8Array, mimeType: string): Promise<string> {
      // The SDK wants an uploadable, not a buffer. The extension matters to the
      // API more than the bytes do, so derive it from the browser's own mime.
      const file = await toFile(Buffer.from(audio), `audio.${extensionFor(mimeType)}`, {
        type: mimeType,
      });
      const res = await client.audio.transcriptions.create({ file, model: cfg.model });
      return res.text.trim();
    },
  };
}

export function createOpenAITTS(cfg: OpenAIVoiceConfig): TextToSpeech {
  const client = new OpenAI({ apiKey: cfg.apiKey });
  return {
    name: "openai",
    async speak(text: string, voice?: string): Promise<SpokenAudio> {
      const res = await client.audio.speech.create({
        model: cfg.model,
        // The SDK pins this to the voices it knew at publish time; new ones ship
        // faster than the types do, and the model rejects a bad name anyway.
        voice: (voice ?? cfg.voice ?? "alloy") as never,
        input: text,
      });
      return { audio: new Uint8Array(await res.arrayBuffer()), mimeType: "audio/mpeg" };
    },
  };
}
