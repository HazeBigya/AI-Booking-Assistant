import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getSpeechToText, getTextToSpeech, resetVoiceCache, voiceStatus } from "@server/sdk/voice";

const TOUCHED = [
  "VOICE_STT_PROVIDER",
  "VOICE_TTS_PROVIDER",
  "OPENAI_API_KEY",
  "ELEVENLABS_API_KEY",
  "DEEPGRAM_API_KEY",
];

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(TOUCHED.map((k) => [k, process.env[k]]));
  for (const k of TOUCHED) delete process.env[k];
  resetVoiceCache();
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetVoiceCache();
});

describe("voice provider resolution", () => {
  it("defaults to openai for both when only a key is present", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    expect(getSpeechToText().name).toBe("openai");
    expect(getTextToSpeech().name).toBe("openai");
  });

  // The error has to say what to do, not that something went wrong.
  it("names the missing env var instead of failing vaguely", () => {
    expect(() => getTextToSpeech()).toThrowError(/OPENAI_API_KEY/);
  });

  it("rejects an unknown provider and lists the valid ones", () => {
    process.env.VOICE_TTS_PROVIDER = "wavenet";
    expect(() => getTextToSpeech()).toThrowError(/elevenlabs/);
  });

  // Nobody hears the STT, so a free one is a real choice. The TTS is the
  // thing the client complained about, so there is no free row for it.
  it("allows browser STT with no key", () => {
    process.env.VOICE_STT_PROVIDER = "browser";
    expect(getSpeechToText().name).toBe("browser");
  });

  it("refuses browser as a TTS provider", () => {
    process.env.VOICE_TTS_PROVIDER = "browser";
    expect(() => getTextToSpeech()).toThrowError(/browser/);
  });

  it("resolves the two sides independently", () => {
    process.env.VOICE_STT_PROVIDER = "deepgram";
    process.env.DEEPGRAM_API_KEY = "dg-test";
    process.env.VOICE_TTS_PROVIDER = "elevenlabs";
    process.env.ELEVENLABS_API_KEY = "el-test";
    expect(getSpeechToText().name).toBe("deepgram");
    expect(getTextToSpeech().name).toBe("elevenlabs");
  });
});

describe("voiceStatus", () => {
  it("reports both unavailable with a reason instead of throwing", () => {
    const status = voiceStatus();
    expect(status.tts).toBe(false);
    expect(status.reason).toMatch(/OPENAI_API_KEY/);
  });

  it("reports available once a key exists", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    expect(voiceStatus()).toMatchObject({ stt: true, tts: true });
  });
});
