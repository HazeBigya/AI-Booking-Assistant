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

  // Speed is the first thing that turns a helpful voice into an impatient one,
  // which is why this is pinned rather than left to taste.
  it("never rushes the patient", () => {
    expect(SPEAKING_RATE).toBeLessThanOrEqual(1);
    expect(SPEAKING_RATE).toBeGreaterThanOrEqual(0.85);
  });

  // Asserting positively, because the direction names hurriedness in order to
  // forbid it — a banned-word check cannot tell "be efficient" from "never
  // sound efficient", and would have failed the very sentence that fixed this.
  it("asks for someone with time for the patient", () => {
    expect(SPEAKING_STYLE).toMatch(/patient rather than efficient|has time for them/i);
    expect(SPEAKING_STYLE).toMatch(/relaxed|unhurried/i);
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
