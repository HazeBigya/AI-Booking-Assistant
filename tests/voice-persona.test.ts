import { describe, expect, it } from "vitest";
import { TTS_VENDORS } from "@server/sdk/voice";
import {
  ELEVENLABS_VOICE_SETTINGS,
  OPENAI_TTS_MODEL,
  OPENAI_VOICE,
} from "@server/sdk/voice/persona";

// The clinic has one receptionist, and on OpenAI she is a model and a voice
// together rather than either alone: the newer models render nova as
// authoritative instead of friendly, which is the opposite of what a patient
// ringing a dentist needs. Settled by listening, so these guard the result
// against someone later "upgrading" the model on paper.
describe("the clinic's voice", () => {
  it("keeps the model the voice was chosen with", () => {
    expect(OPENAI_TTS_MODEL).toBe("tts-1");
    expect(OPENAI_VOICE).toBe("nova");
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
