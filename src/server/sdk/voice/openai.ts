import OpenAI, { toFile } from "openai";
import { extensionFor } from "./mime";
import { OPENAI_VOICE, SPEAKING_RATE, SPEAKING_STYLE } from "./persona";
import type { SpeechToText, SpokenAudio, TextToSpeech } from "./types";

export interface OpenAIVoiceConfig {
  apiKey: string;
  model: string;
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
    async speak(text: string): Promise<SpokenAudio> {
      const res = await client.audio.speech.create({
        model: cfg.model,
        // The SDK pins this to the voices it knew at publish time; new ones ship
        // faster than the types do, and the model rejects a bad name anyway.
        voice: OPENAI_VOICE as never,
        input: text,
        speed: SPEAKING_RATE,
        // Only the gpt-4o speech models take delivery direction. Sending it to
        // tts-1 would be rejected, so the older models simply go without.
        ...(cfg.model.startsWith("gpt-4o") ? { instructions: SPEAKING_STYLE } : {}),
      });
      return { audio: new Uint8Array(await res.arrayBuffer()), mimeType: "audio/mpeg" };
    },
  };
}
