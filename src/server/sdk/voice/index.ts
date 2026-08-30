import { createDeepgramSTT, createDeepgramTTS } from "./deepgram";
import { createElevenLabsSTT, createElevenLabsTTS } from "./elevenlabs";
import { createOpenAISTT, createOpenAITTS } from "./openai";
import { OPENAI_TTS_MODEL } from "./persona";
import type { SpeechToText, TextToSpeech } from "./types";

export type { SpeechToText, SpokenAudio, TextToSpeech } from "./types";

interface VoiceVendor {
  label: string;
  keyEnv?: string; // absent = needs no key
  modelEnv: string;
  defaultModel: string;
}

// Two independent choices, because STT and TTS are separate products with
// separate prices, and because the chat vendor (AI_PROVIDER) may sell neither.
// VOICE_PROVIDER sets both at once for the common case where one vendor sells
// both; the per-side vars override it, for mixing vendors and because the
// tables below are not symmetric — browser listens but is refused as a voice.
//
// Model ids drift between releases, so every default has an env override and
// nothing here is a hardcoded constant.
export const STT_VENDORS: Record<string, VoiceVendor> = {
  openai: {
    label: "OpenAI Whisper",
    keyEnv: "OPENAI_API_KEY",
    modelEnv: "VOICE_STT_MODEL",
    defaultModel: "whisper-1",
  },
  elevenlabs: {
    label: "ElevenLabs Scribe",
    keyEnv: "ELEVENLABS_API_KEY",
    modelEnv: "VOICE_STT_MODEL",
    defaultModel: "scribe_v2",
  },
  deepgram: {
    label: "Deepgram",
    keyEnv: "DEEPGRAM_API_KEY",
    modelEnv: "VOICE_STT_MODEL",
    defaultModel: "nova-3",
  },
  browser: {
    label: "Browser Web Speech (free, Chrome only)",
    modelEnv: "VOICE_STT_MODEL",
    defaultModel: "",
  },
};

// No `browser` row on purpose. The browser's speechSynthesis IS the mechanical
// Google Translate voice the brief rejected; offering it as a fallback would
// silently ship the exact thing that was refused. Poor STT costs accuracy,
// which the booking confirmation already catches; poor TTS costs the product
// its personality, which nothing catches.
export const TTS_VENDORS: Record<string, VoiceVendor> = {
  openai: {
    label: "OpenAI",
    keyEnv: "OPENAI_API_KEY",
    modelEnv: "VOICE_TTS_MODEL",
    // Chosen with the voice, not separately — see persona.ts.
    defaultModel: OPENAI_TTS_MODEL,
  },
  elevenlabs: {
    label: "ElevenLabs",
    keyEnv: "ELEVENLABS_API_KEY",
    modelEnv: "VOICE_TTS_MODEL",
    defaultModel: "eleven_flash_v2_5",
  },
  deepgram: {
    label: "Deepgram Aura",
    keyEnv: "DEEPGRAM_API_KEY",
    modelEnv: "VOICE_TTS_MODEL",
    // Thalia: female and warm, to match the receptionist the other two vendors
    // are configured for. Deepgram names the voice inside the model id.
    defaultModel: "aura-2-thalia-en",
  },
};

let sttCache: SpeechToText | undefined;
let ttsCache: TextToSpeech | undefined;

// Tests only: the cache would otherwise outlive an env change.
export function resetVoiceCache(): void {
  sttCache = undefined;
  ttsCache = undefined;
}

export function getSpeechToText(): SpeechToText {
  if (sttCache) return sttCache;
  const { name, source } = provider("VOICE_STT_PROVIDER");
  const vendor = pick(STT_VENDORS, name, source, "VOICE_STT_PROVIDER");

  if (name === "browser") {
    // The transcript arrives already transcribed from the client. This row
    // exists so the route has one uniform shape to resolve against.
    sttCache = {
      name: "browser",
      async transcribe() {
        throw new Error("browser STT transcribes in the client, not on the server");
      },
    };
  } else if (name === "elevenlabs") {
    sttCache = createElevenLabsSTT({ apiKey: key(vendor), model: model(vendor) });
  } else if (name === "deepgram") {
    sttCache = createDeepgramSTT({ apiKey: key(vendor), model: model(vendor) });
  } else {
    sttCache = createOpenAISTT({ apiKey: key(vendor), model: model(vendor) });
  }
  return sttCache;
}

export function getTextToSpeech(): TextToSpeech {
  if (ttsCache) return ttsCache;
  const { name, source } = provider("VOICE_TTS_PROVIDER");
  const vendor = pick(TTS_VENDORS, name, source, "VOICE_TTS_PROVIDER");

  if (name === "elevenlabs") {
    ttsCache = createElevenLabsTTS({ apiKey: key(vendor), model: model(vendor) });
  } else if (name === "deepgram") {
    ttsCache = createDeepgramTTS({ apiKey: key(vendor), model: model(vendor) });
  } else {
    ttsCache = createOpenAITTS({ apiKey: key(vendor), model: model(vendor) });
  }
  return ttsCache;
}

// The client needs to disable the mic with a reason, and a thrown error is a
// bad way to say "not configured". This is the non-throwing view of the same.
export function voiceStatus(): { stt: boolean; tts: boolean; reason?: string } {
  let reason: string | undefined;
  let stt = false;
  let tts = false;
  try {
    getSpeechToText();
    stt = true;
  } catch (err) {
    reason = message(err);
  }
  try {
    getTextToSpeech();
    tts = true;
  } catch (err) {
    reason ??= message(err);
  }
  return { stt, tts, reason };
}

// `source` is the var the value actually came from, so the error blames the
// line the reader has to edit rather than one they never set.
function provider(specificEnv: string): { name: string; source: string } {
  const specific = env(specificEnv);
  if (specific) return { name: specific, source: specificEnv };
  const shared = env("VOICE_PROVIDER");
  if (shared) return { name: shared, source: "VOICE_PROVIDER" };
  return { name: "openai", source: specificEnv };
}

function pick(
  table: Record<string, VoiceVendor>,
  name: string,
  source: string,
  specificEnv: string,
): VoiceVendor {
  const vendor = table[name];
  if (vendor) return vendor;

  const valid = Object.keys(table).join(", ");
  // Hitting this through VOICE_PROVIDER means the vendor sells the other half
  // but not this one, so point at the escape hatch instead of just refusing.
  const hint =
    source === "VOICE_PROVIDER"
      ? ` "${name}" is not available for this half of voice; set ${specificEnv} to something else.`
      : "";
  throw new Error(`Unknown ${source}="${name}". Valid values: ${valid}.${hint} See .env.example.`);
}

function key(vendor: VoiceVendor): string {
  if (!vendor.keyEnv) throw new Error(`${vendor.label} needs no API key`);
  const value = env(vendor.keyEnv);
  if (!value) throw new Error(`No ${vendor.label} key. Set ${vendor.keyEnv} in .env.`);
  return value;
}

function model(vendor: VoiceVendor): string {
  return env(vendor.modelEnv) ?? vendor.defaultModel;
}

// compose passes unset variables through as empty strings, which `??` accepts.
function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
