import { describe, expect, it } from "vitest";
import {
  ELEVENLABS_VOICE_SETTINGS,
  SPEAKING_RATE,
  SPEAKING_STYLE,
} from "@server/sdk/voice/persona";

// The clinic has one receptionist. Each vendor expresses her differently —
// OpenAI reads a sentence of direction, ElevenLabs reads numbers — so the risk
// is not that either is wrong but that they quietly drift into two people.
describe("the clinic's voice", () => {
  it("asks OpenAI for the receptionist the brief wanted", () => {
    expect(SPEAKING_STYLE).toMatch(/warm/i);
    expect(SPEAKING_STYLE).toMatch(/female/i);
    expect(SPEAKING_STYLE).toMatch(/receptionist/i);
  });

  it("speaks a little faster than the vendors' own default", () => {
    expect(SPEAKING_RATE).toBeGreaterThan(1);
    expect(SPEAKING_RATE).toBeLessThan(1.5); // past this it stops sounding human
  });

  it("hands ElevenLabs the same pace rather than a second opinion", () => {
    expect(ELEVENLABS_VOICE_SETTINGS.speed).toBe(SPEAKING_RATE);
  });

  // Fully stable is what makes a good voice sound recited.
  it("leaves ElevenLabs room to vary its delivery", () => {
    expect(ELEVENLABS_VOICE_SETTINGS.stability).toBeLessThan(0.6);
    expect(ELEVENLABS_VOICE_SETTINGS.stability).toBeGreaterThan(0.2);
  });
});
