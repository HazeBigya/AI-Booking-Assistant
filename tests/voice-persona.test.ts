import { describe, expect, it } from "vitest";
import { TTS_VENDORS } from "@server/sdk/voice";
import {
  ELEVENLABS_VOICE_SETTINGS,
  OPENAI_TTS_MODEL,
  OPENAI_VOICE,
} from "@server/sdk/voice/persona";

// The clinic has one receptionist, and on OpenAI she is a model and a voice
// together rather than either alone — the two interact, and the pairing was
// settled by listening to it. These guard that result against someone later
// changing one half of it on paper.
describe("the clinic's voice", () => {
  it("keeps the model the voice was chosen with", () => {
    expect(OPENAI_TTS_MODEL).toBe("tts-1-hd");
    expect(OPENAI_VOICE).toBe("shimmer");
  });

  it("is what the registry actually reaches for by default", () => {
    expect(TTS_VENDORS.openai.defaultModel).toBe(OPENAI_TTS_MODEL);
  });

  // Fully stable is what makes a good voice sound recited.
  it("leaves ElevenLabs room to vary its delivery", () => {
    expect(ELEVENLABS_VOICE_SETTINGS.stability).toBeLessThan(0.6);
    expect(ELEVENLABS_VOICE_SETTINGS.stability).toBeGreaterThan(0.2);
  });

  // Every attempt to speed her up read as impatience, so there is no dial.
  it("does not hurry her", () => {
    expect(ELEVENLABS_VOICE_SETTINGS).not.toHaveProperty("speed");
  });
});
