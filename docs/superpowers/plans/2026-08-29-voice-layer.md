# Voice Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a patient hold the existing booking conversation by speaking, with a real neural voice, without changing one line of the chat loop, prompt, guardrails, or booking core.

**Architecture:** Voice is bookends around an unchanged core. Browser records → STT turns audio into a string → that string enters the existing `/api/chat` untouched → the reply is stripped of markdown, split into sentences, and each sentence is spoken as it is produced so playback starts before generation finishes. Speech vendors sit behind two interfaces in `src/server/sdk/voice/`, resolved from env exactly like `sdk/ai/providers/`.

**Tech Stack:** Next.js 14 App Router, TypeScript, vitest, `openai` SDK v4 (already a dependency), plain `fetch` for ElevenLabs and Deepgram (no new dependencies), browser `MediaRecorder` + `WebAudio` `AnalyserNode`.

**Spec:** `docs/superpowers/specs/2026-08-29-voice-design.md`

## Global Constraints

- **`src/server/sdk/ai/` is not modified.** No file in it is touched by any task.
- **`src/server/domain/booking/` is not modified.** Same rule as AI, per spec §3.
- **`app/api/chat/route.ts` and `src/server/controllers/chat-controller.ts` are not modified.** Voice hands the existing pipeline a string; nothing downstream can tell voice from typing.
- **No new npm dependencies.** `openai@^4.56.0` is already present; ElevenLabs and Deepgram are reached with `fetch`.
- **Zero-key builds must work.** Every task through Task 7 is unit-testable with no API key and no network. The key is only needed for manual smoke testing.
- **Missing voice key degrades visibly, never silently.** The mic button is disabled with a reason naming the env var. Never fall back to browser `speechSynthesis` — that is the "mechanical voice from Google Translate" the client explicitly rejected.
- **Model IDs are env-overridable defaults, not hardcoded constants.** Vendor model names drift; every default in the registry has a matching `*_MODEL` env var.
- **Path aliases:** `@server` → `src/server`, `@client` → `src/client`, `@` → repo root. Configured in both `tsconfig.json` and `vitest.config.ts`.
- **Test command:** `npm test` (vitest run). Single file: `npx vitest run tests/<file>.test.ts`.
- **Typecheck command:** `npx tsc --noEmit`. Must be clean before every commit.
- **Comment style:** comments explain *why*, never *what*. Match the density of the file being edited.

---

## File Structure

**Created — server:**

| File | Responsibility |
|---|---|
| `src/server/sdk/voice/types.ts` | `SpeechToText` and `TextToSpeech` interfaces. The only thing routes import. |
| `src/server/sdk/voice/index.ts` | Vendor tables + cached resolution from env. Mirrors `sdk/ai/providers/index.ts`. |
| `src/server/sdk/voice/openai.ts` | `whisper-1` transcription + `gpt-4o-mini-tts` speech. |
| `src/server/sdk/voice/elevenlabs.ts` | TTS only, via `fetch`. |
| `src/server/sdk/voice/deepgram.ts` | STT + TTS, via `fetch`. |
| `src/server/sdk/voice/store.ts` | `VoiceStore` seam; local-disk implementation under `storage/voice/`. |
| `src/server/sdk/voice/speakable.ts` | Markdown stripping + sentence splitting. Pure, no I/O. |

**Created — routes:**

| File | Responsibility |
|---|---|
| `app/api/voice/transcribe/route.ts` | POST multipart audio → `{ text }`. |
| `app/api/voice/speak/route.ts` | POST `{ text }` → audio bytes. |
| `app/api/voice/config/route.ts` | GET → `{ stt, tts, reason }` so the client can disable the mic with a reason. |

**Created — client:**

| File | Responsibility |
|---|---|
| `src/client/voice/silence.ts` | Pure endpointing state machine over a stream of volume samples. |
| `src/client/voice/capture.ts` | `getUserMedia` + `MediaRecorder` + `AnalyserNode`, driven by `silence.ts`. |
| `src/client/voice/playback.ts` | Ordered FIFO audio queue. Play function injected, so it is testable in node. |
| `src/client/voice/api.ts` | `fetch` wrappers for the three voice routes. |
| `src/client/voice/useVoice.ts` | React hook binding capture + playback to `ConversationState`. |

**Created — tests:**

`tests/voice-speakable.test.ts`, `tests/voice-config.test.ts`, `tests/voice-silence.test.ts`, `tests/voice-playback.test.ts`, `tests/voice-store.test.ts`

**Modified:**

| File | Change |
|---|---|
| `.gitignore` | add `/storage` |
| `.env.example` | add the VOICE block |
| `src/client/components/Chat.tsx:84-87` | replace the placeholder `toggleVoice` with the real hook |
| `src/client/components/chat/Composer.tsx` | accept `voiceDisabledReason` and render the mic disabled |
| `README.md` | voice section + provider table |

---

### Task 1: Speakable text — strip markdown, split into sentences

Pure functions, no I/O, no key. Built first because sentence splitting is what makes the whole streaming design work, and because it is the only piece with genuinely tricky logic.

Two problems solved here. First, the assistant's replies contain markdown (`**Kate**`, `- 11:30`), and a TTS model reads asterisks and hyphens aloud. Second, sending the whole reply to TTS costs 4-6 seconds of dead air; splitting it lets sentence one play while sentence two is still being generated.

**Files:**
- Create: `src/server/sdk/voice/speakable.ts`
- Test: `tests/voice-speakable.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `stripMarkdown(text: string): string`
  - `splitSentences(text: string, minChars?: number): string[]`
  - `toSpeakable(text: string, minChars?: number): string[]`

- [ ] **Step 1: Write the failing test**

Create `tests/voice-speakable.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { splitSentences, stripMarkdown, toSpeakable } from "@server/sdk/voice/speakable";

describe("stripMarkdown", () => {
  it("removes emphasis without eating the words", () => {
    expect(stripMarkdown("**Kate** is *free* at `11:30`")).toBe("Kate is free at 11:30");
  });

  it("turns list bullets into plain clauses", () => {
    expect(stripMarkdown("- Cleaning\n- Whitening")).toBe("Cleaning\nWhitening");
  });

  it("keeps a link's text and drops its url", () => {
    expect(stripMarkdown("see [our services](https://x.test/s)")).toBe("see our services");
  });

  it("drops heading markers", () => {
    expect(stripMarkdown("## Services")).toBe("Services");
  });
});

describe("splitSentences", () => {
  it("splits on sentence terminators", () => {
    expect(splitSentences("Kate is free from 11:30. Want me to book it?")).toEqual([
      "Kate is free from 11:30.",
      "Want me to book it?",
    ]);
  });

  // The whole reason this is not a one-line regex.
  it("does not split on a title abbreviation", () => {
    expect(splitSentences("Dr. Kate has an opening tomorrow morning.")).toEqual([
      "Dr. Kate has an opening tomorrow morning.",
    ]);
  });

  it("does not split on a.m. / p.m.", () => {
    expect(splitSentences("It starts at 11:30 a.m. and runs an hour.")).toEqual([
      "It starts at 11:30 a.m. and runs an hour.",
    ]);
  });

  it("keeps an unterminated tail", () => {
    expect(splitSentences("no terminator here")).toEqual(["no terminator here"]);
  });

  it("returns nothing for blank input", () => {
    expect(splitSentences("   ")).toEqual([]);
  });

  // A two-word chunk is not worth its own HTTP request and sounds clipped.
  it("merges a chunk shorter than minChars into the next one", () => {
    expect(splitSentences("Sure. Kate is free from 11:30 tomorrow.", 12)).toEqual([
      "Sure. Kate is free from 11:30 tomorrow.",
    ]);
  });

  it("merges a short tail backwards so nothing is dropped", () => {
    expect(splitSentences("Kate is free from 11:30 tomorrow. OK?", 12)).toEqual([
      "Kate is free from 11:30 tomorrow. OK?",
    ]);
  });
});

describe("toSpeakable", () => {
  it("strips then splits", () => {
    expect(toSpeakable("**Kate** is free at 11:30. Shall I book it?")).toEqual([
      "Kate is free at 11:30.",
      "Shall I book it?",
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/voice-speakable.test.ts`
Expected: FAIL — `Failed to resolve import "@server/sdk/voice/speakable"`.

- [ ] **Step 3: Write the implementation**

Create `src/server/sdk/voice/speakable.ts`:

```ts
// A TTS model reads what it is given. Hand it raw markdown and it says
// "asterisk asterisk Kate"; hand it a whole reply and the patient waits in
// silence for all of it. Both problems are solved before any audio exists.

// Periods that end a word here are not sentence boundaries. Lowercased, and
// stored without the trailing dot so multi-dot forms like "a.m" match too.
const ABBREVIATIONS = new Set([
  "dr", "mr", "mrs", "ms", "prof", "st", "approx", "no", "vs", "etc",
  "e.g", "i.e", "a.m", "p.m",
]);

export function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")          // fenced code: unspeakable
    .replace(/`([^`]*)`/g, "$1")              // inline code: keep the words
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")    // images: nothing to say
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")  // links: say the text, not the url
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")       // headings
    .replace(/^\s{0,3}[-*+]\s+/gm, "")        // bullets
    .replace(/^\s{0,3}>\s?/gm, "")            // blockquotes
    .replace(/(\*\*|__)(.*?)\1/g, "$2")       // bold
    .replace(/(\*|_)(.*?)\1/g, "$2")          // italic
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .trim();
}

export function splitSentences(text: string, minChars = 12): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const raw: string[] = [];
  let start = 0;
  for (let i = 0; i < trimmed.length; i++) {
    if (!".!?".includes(trimmed[i])) continue;
    // A boundary needs whitespace or end-of-string after it, otherwise it is
    // decimal point, url, or version number.
    const next = trimmed[i + 1];
    if (next !== undefined && !/\s/.test(next)) continue;
    if (endsWithAbbreviation(trimmed.slice(start, i))) continue;
    raw.push(trimmed.slice(start, i + 1).trim());
    start = i + 1;
  }
  const tail = trimmed.slice(start).trim();
  if (tail) raw.push(tail);

  return mergeShort(raw, minChars);
}

export function toSpeakable(text: string, minChars = 12): string[] {
  return splitSentences(stripMarkdown(text), minChars);
}

function endsWithAbbreviation(chunk: string): boolean {
  const lastWord = chunk.split(/\s/).pop() ?? "";
  return ABBREVIATIONS.has(lastWord.toLowerCase().replace(/\.$/, ""));
}

// A two-word chunk costs a whole HTTP round trip and sounds clipped, so glue it
// to a neighbour. Forward first; a short final chunk has to go backwards.
function mergeShort(chunks: string[], minChars: number): string[] {
  const out: string[] = [];
  let pending = "";
  for (const chunk of chunks) {
    const merged = pending ? `${pending} ${chunk}` : chunk;
    if (merged.length < minChars) {
      pending = merged;
      continue;
    }
    out.push(merged);
    pending = "";
  }
  if (pending) {
    if (out.length > 0) out[out.length - 1] += ` ${pending}`;
    else out.push(pending);
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/voice-speakable.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/server/sdk/voice/speakable.ts tests/voice-speakable.test.ts
git commit -m "Add speakable-text splitting for voice replies"
```

---

### Task 2: Voice provider interfaces, registry, and the OpenAI adapter

The seam. Two interfaces and one env-driven resolver that mirrors `sdk/ai/providers/index.ts` — same vendor-table shape, same cached instance, same style of error message that names the exact variable to set.

STT and TTS resolve independently because they are separate products with separate prices, and because the chat vendor (`AI_PROVIDER=deepseek`) sells no speech models at all. `browser` is a valid STT value and deliberately **not** a valid TTS value: nobody hears the STT, so cheap ears cost accuracy that the booking confirmation step already catches, while a cheap mouth costs the product the exact thing the client complained about.

**Files:**
- Create: `src/server/sdk/voice/types.ts`, `src/server/sdk/voice/index.ts`, `src/server/sdk/voice/openai.ts`
- Test: `tests/voice-config.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces:
  - `interface SpeechToText { readonly name: string; transcribe(audio: Uint8Array, mimeType: string): Promise<string> }`
  - `interface TextToSpeech { readonly name: string; speak(text: string, voice?: string): Promise<SpokenAudio> }`
  - `interface SpokenAudio { audio: Uint8Array; mimeType: string }`
  - `getSpeechToText(): SpeechToText` — throws with a message naming the env var
  - `getTextToSpeech(): TextToSpeech` — same
  - `voiceStatus(): { stt: boolean; tts: boolean; reason?: string }` — never throws
  - `resetVoiceCache(): void` — tests only
  - `createOpenAISTT(cfg)`, `createOpenAITTS(cfg)`

- [ ] **Step 1: Write the failing test**

Create `tests/voice-config.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getSpeechToText, getTextToSpeech, resetVoiceCache, voiceStatus } from "@server/sdk/voice";

const TOUCHED = [
  "VOICE_STT_PROVIDER", "VOICE_TTS_PROVIDER",
  "OPENAI_API_KEY", "ELEVENLABS_API_KEY", "DEEPGRAM_API_KEY",
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/voice-config.test.ts`
Expected: FAIL — `Failed to resolve import "@server/sdk/voice"`.

- [ ] **Step 3: Write the interfaces**

Create `src/server/sdk/voice/types.ts`:

```ts
// Vendor-neutral. The routes import only these, so a new speech vendor drops in
// behind the interface the same way a new LLM drops in behind LLMProvider.

export interface SpokenAudio {
  audio: Uint8Array;
  mimeType: string; // what to hand the browser's <audio>, e.g. 'audio/mpeg'
}

export interface SpeechToText {
  readonly name: string;
  transcribe(audio: Uint8Array, mimeType: string): Promise<string>;
}

export interface TextToSpeech {
  readonly name: string;
  speak(text: string, voice?: string): Promise<SpokenAudio>;
}
```

- [ ] **Step 4: Write the OpenAI adapter**

Create `src/server/sdk/voice/openai.ts`:

```ts
import OpenAI, { toFile } from "openai";
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
        voice: (voice ?? cfg.voice ?? "alloy") as never,
        input: text,
      });
      return { audio: new Uint8Array(await res.arrayBuffer()), mimeType: "audio/mpeg" };
    },
  };
}

function extensionFor(mimeType: string): string {
  const base = mimeType.split(";")[0].trim();
  return { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "mp4", "audio/mpeg": "mp3", "audio/wav": "wav" }[base] ?? "webm";
}
```

- [ ] **Step 5: Write the registry**

Create `src/server/sdk/voice/index.ts`:

```ts
import { createOpenAISTT, createOpenAITTS } from "./openai";
import type { SpeechToText, TextToSpeech } from "./types";

export type { SpeechToText, SpokenAudio, TextToSpeech } from "./types";

interface VoiceVendor {
  label: string;
  keyEnv?: string; // absent = needs no key
  modelEnv: string;
  defaultModel: string;
}

// Model ids drift between releases, so every default has an env override and
// nothing here is a hardcoded constant.
export const STT_VENDORS: Record<string, VoiceVendor> = {
  openai: { label: "OpenAI Whisper", keyEnv: "OPENAI_API_KEY", modelEnv: "VOICE_STT_MODEL", defaultModel: "whisper-1" },
  deepgram: { label: "Deepgram", keyEnv: "DEEPGRAM_API_KEY", modelEnv: "VOICE_STT_MODEL", defaultModel: "nova-3" },
  browser: { label: "Browser Web Speech (free, Chrome only)", modelEnv: "VOICE_STT_MODEL", defaultModel: "" },
};

// No `browser` row on purpose. The browser's speechSynthesis IS the mechanical
// Google Translate voice the client rejected; offering it as a fallback would
// silently ship the exact thing that was refused.
export const TTS_VENDORS: Record<string, VoiceVendor> = {
  openai: { label: "OpenAI", keyEnv: "OPENAI_API_KEY", modelEnv: "VOICE_TTS_MODEL", defaultModel: "gpt-4o-mini-tts" },
  elevenlabs: { label: "ElevenLabs", keyEnv: "ELEVENLABS_API_KEY", modelEnv: "VOICE_TTS_MODEL", defaultModel: "eleven_flash_v2_5" },
  deepgram: { label: "Deepgram Aura", keyEnv: "DEEPGRAM_API_KEY", modelEnv: "VOICE_TTS_MODEL", defaultModel: "aura-2-thalia-en" },
};

let sttCache: SpeechToText | undefined;
let ttsCache: TextToSpeech | undefined;

export function resetVoiceCache(): void {
  sttCache = undefined;
  ttsCache = undefined;
}

export function getSpeechToText(): SpeechToText {
  if (sttCache) return sttCache;
  const name = env("VOICE_STT_PROVIDER") ?? "openai";
  const vendor = pick(STT_VENDORS, name, "VOICE_STT_PROVIDER");

  if (name === "browser") {
    // The transcript arrives already-transcribed from the client; the server
    // side of this row exists so the route has one uniform shape.
    sttCache = { name: "browser", async transcribe() { throw new Error("browser STT transcribes in the client"); } };
    return sttCache;
  }
  if (name === "deepgram") {
    // Imported lazily so a missing optional vendor never breaks the openai path.
    const { createDeepgramSTT } = require("./deepgram") as typeof import("./deepgram");
    sttCache = createDeepgramSTT({ apiKey: key(vendor, name), model: model(vendor) });
    return sttCache;
  }
  sttCache = createOpenAISTT({ apiKey: key(vendor, name), model: model(vendor) });
  return sttCache;
}

export function getTextToSpeech(): TextToSpeech {
  if (ttsCache) return ttsCache;
  const name = env("VOICE_TTS_PROVIDER") ?? "openai";
  const vendor = pick(TTS_VENDORS, name, "VOICE_TTS_PROVIDER");

  if (name === "elevenlabs") {
    const { createElevenLabsTTS } = require("./elevenlabs") as typeof import("./elevenlabs");
    ttsCache = createElevenLabsTTS({ apiKey: key(vendor, name), model: model(vendor), voice: env("VOICE_TTS_VOICE") });
    return ttsCache;
  }
  if (name === "deepgram") {
    const { createDeepgramTTS } = require("./deepgram") as typeof import("./deepgram");
    ttsCache = createDeepgramTTS({ apiKey: key(vendor, name), model: model(vendor) });
    return ttsCache;
  }
  ttsCache = createOpenAITTS({ apiKey: key(vendor, name), model: model(vendor), voice: env("VOICE_TTS_VOICE") });
  return ttsCache;
}

// The client needs to disable the mic with a reason, and a thrown error is a
// bad way to say "not configured". This is the non-throwing view.
export function voiceStatus(): { stt: boolean; tts: boolean; reason?: string } {
  let reason: string | undefined;
  let stt = false;
  let tts = false;
  try { getSpeechToText(); stt = true; } catch (err) { reason = message(err); }
  try { getTextToSpeech(); tts = true; } catch (err) { reason ??= message(err); }
  return { stt, tts, reason };
}

function pick(table: Record<string, VoiceVendor>, name: string, envName: string): VoiceVendor {
  const vendor = table[name];
  if (!vendor) {
    throw new Error(
      `Unknown ${envName}="${name}". Valid values: ${Object.keys(table).join(", ")}. See .env.example.`,
    );
  }
  return vendor;
}

function key(vendor: VoiceVendor, name: string): string {
  if (!vendor.keyEnv) throw new Error(`${name} needs no key`);
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
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run tests/voice-config.test.ts`
Expected: FAIL on the two rows that `require("./deepgram")` and `require("./elevenlabs")` — those files arrive in Task 3. Temporarily confirm the other 6 tests pass by running with `-t` filters, then complete Task 3 and re-run the full file. If you prefer a green bar at every commit, do Task 3 before committing Task 2 and make one commit for both.

- [ ] **Step 7: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/server/sdk/voice/ tests/voice-config.test.ts
git commit -m "Add voice provider seam with OpenAI STT and TTS"
```

---

### Task 3: ElevenLabs and Deepgram connectors

The client asked for connectors so the *user* picks the vendor and pays. Both are reached with `fetch` — no SDKs, no new dependencies. ElevenLabs is TTS only; it is the quality bar named in the client's email, shipped as an option rather than as the default.

**Files:**
- Create: `src/server/sdk/voice/elevenlabs.ts`, `src/server/sdk/voice/deepgram.ts`
- Test: `tests/voice-config.test.ts` (already written in Task 2 — this task makes the remaining rows pass)

**Interfaces:**
- Consumes: `SpeechToText`, `TextToSpeech`, `SpokenAudio` from `./types`
- Produces:
  - `createElevenLabsTTS(cfg: { apiKey: string; model: string; voice?: string }): TextToSpeech`
  - `createDeepgramSTT(cfg: { apiKey: string; model: string }): SpeechToText`
  - `createDeepgramTTS(cfg: { apiKey: string; model: string }): TextToSpeech`

- [ ] **Step 1: Write the ElevenLabs connector**

Create `src/server/sdk/voice/elevenlabs.ts`:

```ts
import type { SpokenAudio, TextToSpeech } from "./types";

// 'Rachel' — ElevenLabs' stock voice, present on every account, so the connector
// works before anyone picks a voice.
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

export interface ElevenLabsConfig {
  apiKey: string;
  model: string;
  voice?: string; // a voice id from elevenlabs.io/app/voice-library
}

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
```

- [ ] **Step 2: Write the Deepgram connector**

Create `src/server/sdk/voice/deepgram.ts`:

```ts
import type { SpeechToText, SpokenAudio, TextToSpeech } from "./types";

export interface DeepgramConfig {
  apiKey: string;
  model: string;
}

export function createDeepgramSTT(cfg: DeepgramConfig): SpeechToText {
  return {
    name: "deepgram",
    async transcribe(audio: Uint8Array, mimeType: string): Promise<string> {
      const url = `https://api.deepgram.com/v1/listen?model=${encodeURIComponent(cfg.model)}&smart_format=true`;
      const res = await fetch(url, {
        method: "POST",
        headers: { authorization: `Token ${cfg.apiKey}`, "content-type": mimeType },
        body: audio as unknown as BodyInit, // raw bytes, not multipart
      });
      if (!res.ok) throw new Error(`Deepgram STT failed (${res.status}): ${await res.text()}`);
      const json = (await res.json()) as {
        results?: { channels?: { alternatives?: { transcript?: string }[] }[] };
      };
      return (json.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "").trim();
    },
  };
}

export function createDeepgramTTS(cfg: DeepgramConfig): TextToSpeech {
  return {
    name: "deepgram",
    async speak(text: string): Promise<SpokenAudio> {
      const url = `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(cfg.model)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { authorization: `Token ${cfg.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error(`Deepgram TTS failed (${res.status}): ${await res.text()}`);
      return { audio: new Uint8Array(await res.arrayBuffer()), mimeType: "audio/mpeg" };
    },
  };
}
```

- [ ] **Step 3: Run the full config test**

Run: `npx vitest run tests/voice-config.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 4: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/server/sdk/voice/elevenlabs.ts src/server/sdk/voice/deepgram.ts
git commit -m "Add ElevenLabs and Deepgram voice connectors"
```

---

### Task 4: VoiceStore — local disk, gitignored

Recordings are debug artifacts, never a source of truth. Losing `storage/voice/` loses nothing. The seam exists so swapping to S3 is a new file rather than a rewrite; that swap is documented as a delta, not built.

Writes are fire-and-forget: a failed disk write must never fail a transcription the patient is waiting on.

**Files:**
- Create: `src/server/sdk/voice/store.ts`
- Modify: `.gitignore`
- Test: `tests/voice-store.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `interface VoiceStore { save(sessionId: string, audio: Uint8Array, mimeType: string): Promise<string | null> }`
  - `createLocalVoiceStore(rootDir?: string): VoiceStore`
  - `getVoiceStore(): VoiceStore`

- [ ] **Step 1: Write the failing test**

Create `tests/voice-store.test.ts`:

```ts
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLocalVoiceStore } from "@server/sdk/voice/store";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "voice-store-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("createLocalVoiceStore", () => {
  it("writes the audio under the session id and returns the path", async () => {
    const store = createLocalVoiceStore(dir);
    const path = await store.save("sess-1", new Uint8Array([1, 2, 3]), "audio/webm");
    expect(path).toContain("sess-1");
    expect(path?.endsWith(".webm")).toBe(true);
    expect([...(await readFile(path!))]).toEqual([1, 2, 3]);
  });

  // A debug artifact must never break the request the patient is waiting on.
  it("returns null instead of throwing when the path is unwritable", async () => {
    const store = createLocalVoiceStore("/proc/nonexistent-voice-root");
    expect(await store.save("sess-1", new Uint8Array([1]), "audio/webm")).toBeNull();
  });

  it("refuses a session id that would escape the root", async () => {
    const store = createLocalVoiceStore(dir);
    expect(await store.save("../../etc", new Uint8Array([1]), "audio/webm")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/voice-store.test.ts`
Expected: FAIL — `Failed to resolve import "@server/sdk/voice/store"`.

- [ ] **Step 3: Write the implementation**

Create `src/server/sdk/voice/store.ts`:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

// Recordings are debug artifacts — "it heard 'Kate' as 'eight'" — and demo
// replay material. Nothing in the request path reads them back, so losing the
// directory loses nothing. The interface exists so S3 is a swap, not a rewrite.
export interface VoiceStore {
  save(sessionId: string, audio: Uint8Array, mimeType: string): Promise<string | null>;
}

const DEFAULT_ROOT = "storage/voice";

export function createLocalVoiceStore(rootDir: string = DEFAULT_ROOT): VoiceStore {
  const root = resolve(rootDir);
  return {
    async save(sessionId, audio, mimeType) {
      try {
        const dir = resolve(root, sessionId);
        // A session id arrives from a cookie. Keep it inside the root.
        if (dir !== root && !dir.startsWith(root + sep)) return null;
        await mkdir(dir, { recursive: true });
        const path = join(dir, `${Date.now()}.${extensionFor(mimeType)}`);
        await writeFile(path, audio);
        return path;
      } catch (err) {
        // Never fail a transcription over a debug artifact.
        console.warn("voice store write failed:", err instanceof Error ? err.message : err);
        return null;
      }
    },
  };
}

let cached: VoiceStore | undefined;

export function getVoiceStore(): VoiceStore {
  cached ??= createLocalVoiceStore(process.env.VOICE_STORAGE_DIR ?? DEFAULT_ROOT);
  return cached;
}

function extensionFor(mimeType: string): string {
  const base = mimeType.split(";")[0].trim();
  return { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "mp4", "audio/wav": "wav" }[base] ?? "bin";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/voice-store.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Gitignore the storage directory**

Append to `.gitignore`:

```
# Voice recordings: debug artifacts, never a source of truth
/storage
```

- [ ] **Step 6: Verify git ignores it**

```bash
mkdir -p storage/voice && touch storage/voice/probe.webm
git status --porcelain storage
```
Expected: no output. Then `rm -rf storage`.

- [ ] **Step 7: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/server/sdk/voice/store.ts tests/voice-store.test.ts .gitignore
git commit -m "Add local voice recording store, gitignored"
```

---

### Task 5: Voice API routes

Three routes. They are thin: parse, delegate to the seam, return. No business logic, because there is none — the reasoning happens in the untouched `/api/chat`.

`config` exists so the client can disable the mic *with a reason naming the env var*, instead of letting the patient press a button that fails.

**Files:**
- Create: `app/api/voice/transcribe/route.ts`, `app/api/voice/speak/route.ts`, `app/api/voice/config/route.ts`

**Interfaces:**
- Consumes: `getSpeechToText`, `getTextToSpeech`, `voiceStatus` from `@server/sdk/voice`; `getVoiceStore` from `@server/sdk/voice/store`; `CHAT_SESSION_COOKIE` from `@server/db/queries/chat`
- Produces (HTTP contract the client in Tasks 6-8 depends on):
  - `POST /api/voice/transcribe` — multipart, field `audio` → `200 { text: string }` | `4xx/5xx { error: string }`
  - `POST /api/voice/speak` — `{ text: string, voice?: string }` → `200` audio bytes with `content-type` | `4xx/5xx { error: string }`
  - `GET  /api/voice/config` → `200 { stt: boolean, tts: boolean, reason?: string }`

- [ ] **Step 1: Write the transcribe route**

Create `app/api/voice/transcribe/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { getSpeechToText } from "@server/sdk/voice";
import { getVoiceStore } from "@server/sdk/voice/store";
import { CHAT_SESSION_COOKIE } from "@server/db/queries/chat";

// A minute of opus is roughly 250 KB; anything past this is not a spoken turn.
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  let stt;
  try {
    stt = getSpeechToText();
  } catch (err) {
    return NextResponse.json({ error: message(err) }, { status: 503 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("audio");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "No audio uploaded." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "Empty recording." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Recording too long." }, { status: 413 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = file.type || "audio/webm";

  // Fire and forget: a debug artifact must not delay or fail the patient's turn.
  const sessionId = req.cookies.get(CHAT_SESSION_COOKIE)?.value ?? "anonymous";
  void getVoiceStore().save(sessionId, bytes, mimeType);

  try {
    const text = await stt.transcribe(bytes, mimeType);
    return NextResponse.json({ text });
  } catch (err) {
    console.error("transcribe failed:", err);
    return NextResponse.json({ error: "Could not transcribe that." }, { status: 502 });
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
```

- [ ] **Step 2: Write the speak route**

Create `app/api/voice/speak/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { getTextToSpeech } from "@server/sdk/voice";

// One sentence at a time. Anything longer is not a chunk, it is a whole reply,
// which is the latency problem the chunking exists to avoid.
const MAX_CHARS = 1200;

export async function POST(req: NextRequest) {
  let tts;
  try {
    tts = getTextToSpeech();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => null)) as { text?: unknown; voice?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "No text to speak." }, { status: 400 });
  if (text.length > MAX_CHARS) {
    return NextResponse.json({ error: "Text too long to speak." }, { status: 413 });
  }

  try {
    const { audio, mimeType } = await tts.speak(text, typeof body?.voice === "string" ? body.voice : undefined);
    return new Response(audio as unknown as BodyInit, {
      status: 200,
      headers: { "content-type": mimeType, "cache-control": "no-store" },
    });
  } catch (err) {
    console.error("speak failed:", err);
    return NextResponse.json({ error: "Could not generate speech." }, { status: 502 });
  }
}
```

- [ ] **Step 3: Write the config route**

Create `app/api/voice/config/route.ts`:

```ts
import { NextResponse } from "next/server";
import { voiceStatus } from "@server/sdk/voice";

// The mic must be disabled with a reason that names the missing variable,
// rather than failing after the patient has already spoken.
export async function GET() {
  return NextResponse.json(voiceStatus());
}
```

- [ ] **Step 4: Verify the routes build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean typecheck; the build output lists `/api/voice/transcribe`, `/api/voice/speak`, `/api/voice/config`.

- [ ] **Step 5: Commit**

```bash
git add app/api/voice
git commit -m "Add voice transcribe, speak, and config routes"
```

---

### Task 6: Endpointing — the pure silence detector

This is what makes the feature tier 2 (it notices you stopped) rather than tier 1 (you press the button again, like a walkie-talkie). It is a state machine over volume samples, and the whole thing is pure so it can be tested without a microphone.

Tuning it is the riskiest hour in this plan: too sensitive and it cuts the patient off mid-sentence, too dull and it adds a second of dead air. Having it as a tested pure function is what makes tuning cheap.

**Files:**
- Create: `src/client/voice/silence.ts`
- Test: `tests/voice-silence.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `interface SilenceOptions { threshold?: number; silenceMs?: number; minSpeechMs?: number; maxMs?: number }`
  - `class SilenceDetector { constructor(opts?: SilenceOptions); push(level: number, atMs: number): "listening" | "speaking" | "done"; reset(): void }`
  - `const DEFAULT_SILENCE: Required<SilenceOptions>`

- [ ] **Step 1: Write the failing test**

Create `tests/voice-silence.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SilenceDetector } from "@client/voice/silence";

// Feed a series of [level, ms] samples and return the last verdict.
function feed(det: SilenceDetector, samples: [number, number][]) {
  let last = "listening";
  for (const [level, at] of samples) last = det.push(level, at);
  return last;
}

describe("SilenceDetector", () => {
  it("stays listening while nobody has spoken yet", () => {
    const det = new SilenceDetector();
    expect(feed(det, [[0.001, 0], [0.001, 100], [0.001, 5000]])).toBe("listening");
  });

  it("reports speaking once the level crosses the threshold", () => {
    const det = new SilenceDetector({ threshold: 0.02 });
    expect(feed(det, [[0.001, 0], [0.2, 100]])).toBe("speaking");
  });

  it("ends the turn after the silence window closes", () => {
    const det = new SilenceDetector({ threshold: 0.02, silenceMs: 800, minSpeechMs: 200 });
    expect(
      feed(det, [
        [0.2, 0], [0.2, 300],   // 300ms of speech, past minSpeechMs
        [0.001, 400], [0.001, 900],
        [0.001, 1101],          // 701ms of quiet: not yet
      ]),
    ).toBe("speaking");
    expect(det.push(0.001, 1201)).toBe("done"); // 801ms
  });

  // A cough or a door is not a turn. Ending on it would send noise to the STT.
  it("ignores a blip shorter than minSpeechMs", () => {
    const det = new SilenceDetector({ threshold: 0.02, silenceMs: 800, minSpeechMs: 300 });
    expect(
      feed(det, [[0.2, 0], [0.2, 100], [0.001, 200], [0.001, 1200]]),
    ).toBe("listening");
  });

  it("restarts the silence window when speech resumes", () => {
    const det = new SilenceDetector({ threshold: 0.02, silenceMs: 800, minSpeechMs: 100 });
    feed(det, [[0.2, 0], [0.2, 200], [0.001, 300], [0.001, 900]]); // 600ms quiet
    expect(det.push(0.2, 1000)).toBe("speaking");                   // spoke again
    expect(det.push(0.001, 1500)).toBe("speaking");                 // only 500ms
    expect(det.push(0.001, 1900)).toBe("done");                     // 900ms
  });

  // Without this a stuck-open mic records until the tab dies.
  it("ends the turn at maxMs even if the level never drops", () => {
    const det = new SilenceDetector({ threshold: 0.02, minSpeechMs: 100, maxMs: 2000 });
    expect(feed(det, [[0.2, 0], [0.2, 1999]])).toBe("speaking");
    expect(det.push(0.2, 2001)).toBe("done");
  });

  it("is reusable after reset", () => {
    const det = new SilenceDetector({ threshold: 0.02, silenceMs: 100, minSpeechMs: 10 });
    feed(det, [[0.2, 0], [0.2, 50], [0.001, 60], [0.001, 200]]);
    det.reset();
    expect(det.push(0.001, 300)).toBe("listening");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/voice-silence.test.ts`
Expected: FAIL — `Failed to resolve import "@client/voice/silence"`.

- [ ] **Step 3: Write the implementation**

Create `src/client/voice/silence.ts`:

```ts
// Auto-endpointing: notice the patient stopped talking and close the turn for
// them. This is the difference between a conversation and a walkie-talkie.
//
// Pure on purpose. Tuning these numbers is the fiddliest part of voice — too
// sensitive cuts people off mid-sentence, too dull adds dead air — and tuning
// against a test is far cheaper than tuning against a microphone.

export interface SilenceOptions {
  threshold?: number;   // RMS level counted as speech (0..1)
  silenceMs?: number;   // quiet needed after speech to end the turn
  minSpeechMs?: number; // speech shorter than this was a cough, not a turn
  maxMs?: number;       // hard stop, so a stuck mic cannot record forever
}

export const DEFAULT_SILENCE: Required<SilenceOptions> = {
  threshold: 0.02,
  silenceMs: 800,
  minSpeechMs: 300,
  maxMs: 30_000,
};

export type SilenceVerdict = "listening" | "speaking" | "done";

export class SilenceDetector {
  private readonly opts: Required<SilenceOptions>;
  private startedAt: number | null = null;
  private speechMs = 0;
  private lastLoudAt: number | null = null;
  private lastAt: number | null = null;

  constructor(opts: SilenceOptions = {}) {
    this.opts = { ...DEFAULT_SILENCE, ...opts };
  }

  reset(): void {
    this.startedAt = null;
    this.speechMs = 0;
    this.lastLoudAt = null;
    this.lastAt = null;
  }

  push(level: number, atMs: number): SilenceVerdict {
    this.startedAt ??= atMs;
    const delta = this.lastAt === null ? 0 : Math.max(0, atMs - this.lastAt);
    this.lastAt = atMs;

    if (level >= this.opts.threshold) {
      this.speechMs += delta;
      this.lastLoudAt = atMs;
    }

    const spokeEnough = this.speechMs >= this.opts.minSpeechMs;
    if (spokeEnough && atMs - this.startedAt >= this.opts.maxMs) return "done";
    if (!spokeEnough) return "listening";
    if (this.lastLoudAt !== null && atMs - this.lastLoudAt >= this.opts.silenceMs) return "done";
    return "speaking";
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/voice-silence.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/client/voice/silence.ts tests/voice-silence.test.ts
git commit -m "Add pure silence detector for voice endpointing"
```

---

### Task 7: Ordered playback queue

The point of the whole design: sentence one plays while sentence two is still being generated. That only works if sentence two can never overtake sentence one — which it will, because TTS latency varies with sentence length.

The play function is injected, so this is testable in node with no `Audio` element.

**Files:**
- Create: `src/client/voice/playback.ts`
- Test: `tests/voice-playback.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type PlayFn = (clip: Blob) => Promise<void>`
  - `class PlaybackQueue { constructor(play: PlayFn); enqueue(index: number, clip: Promise<Blob>): void; whenDrained(): Promise<void>; stop(): void }`

- [ ] **Step 1: Write the failing test**

Create `tests/voice-playback.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PlaybackQueue } from "@client/voice/playback";

const clip = (tag: string) => new Blob([tag], { type: "audio/mpeg" });
const later = <T>(value: T, ms: number) => new Promise<T>((r) => setTimeout(() => r(value), ms));

describe("PlaybackQueue", () => {
  it("plays clips in index order even when they arrive out of order", async () => {
    const played: string[] = [];
    const q = new PlaybackQueue(async (c) => { played.push(await c.text()); });

    // Sentence 2 is short and its TTS returns first. It must still wait.
    q.enqueue(0, later(clip("one"), 40));
    q.enqueue(1, later(clip("two"), 5));
    q.enqueue(2, later(clip("three"), 20));

    await q.whenDrained();
    expect(played).toEqual(["one", "two", "three"]);
  });

  it("never overlaps two clips", async () => {
    let playing = 0;
    let overlapped = false;
    const q = new PlaybackQueue(async () => {
      playing++;
      if (playing > 1) overlapped = true;
      await later(null, 10);
      playing--;
    });

    q.enqueue(0, Promise.resolve(clip("a")));
    q.enqueue(1, Promise.resolve(clip("b")));
    await q.whenDrained();
    expect(overlapped).toBe(false);
  });

  // One failed sentence must not swallow the rest of the reply.
  it("skips a clip that failed to generate and plays the rest", async () => {
    const played: string[] = [];
    const q = new PlaybackQueue(async (c) => { played.push(await c.text()); });

    q.enqueue(0, Promise.resolve(clip("one")));
    q.enqueue(1, Promise.reject(new Error("tts 502")));
    q.enqueue(2, Promise.resolve(clip("three")));

    await q.whenDrained();
    expect(played).toEqual(["one", "three"]);
  });

  it("stops playing anything after stop()", async () => {
    const played: string[] = [];
    const q = new PlaybackQueue(async (c) => { played.push(await c.text()); });
    q.enqueue(0, later(clip("one"), 20));
    q.stop();
    await q.whenDrained();
    expect(played).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/voice-playback.test.ts`
Expected: FAIL — `Failed to resolve import "@client/voice/playback"`.

- [ ] **Step 3: Write the implementation**

Create `src/client/voice/playback.ts`:

```ts
// Sentence one plays while sentence two is still being generated. That is the
// entire latency trick, and it only works if sentence two can never overtake
// sentence one — which it otherwise would, because a short sentence comes back
// from TTS faster than a long one.

export type PlayFn = (clip: Blob) => Promise<void>;

export class PlaybackQueue {
  private readonly pending = new Map<number, Promise<Blob>>();
  private next = 0;
  private draining: Promise<void> = Promise.resolve();
  private stopped = false;

  constructor(private readonly play: PlayFn) {}

  enqueue(index: number, clip: Promise<Blob>): void {
    // Attach a catch now: an unhandled rejection here would crash the tab
    // before the drain loop ever gets to await it.
    this.pending.set(index, clip.catch((err) => Promise.reject(err)));
    this.draining = this.draining.then(() => this.drain());
  }

  whenDrained(): Promise<void> {
    return this.draining;
  }

  stop(): void {
    this.stopped = true;
    this.pending.clear();
  }

  private async drain(): Promise<void> {
    while (!this.stopped) {
      const clip = this.pending.get(this.next);
      if (!clip) return; // the next sentence has not been requested yet
      this.pending.delete(this.next);
      this.next++;
      try {
        const blob = await clip;
        if (this.stopped) return;
        await this.play(blob);
      } catch (err) {
        // One dead sentence must not swallow the rest of the reply.
        console.warn("skipping unplayable sentence:", err instanceof Error ? err.message : err);
      }
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/voice-playback.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/client/voice/playback.ts tests/voice-playback.test.ts
git commit -m "Add ordered playback queue for streamed voice replies"
```

---

### Task 8: Browser capture, the hook, and the UI wiring

Everything above is tested and keyless. This task is the part only a browser can run, so it is last and it is verified by hand.

`Chat.tsx:84-87` currently contains a placeholder that toggles a state and does nothing else. It is replaced here.

**Files:**
- Create: `src/client/voice/api.ts`, `src/client/voice/capture.ts`, `src/client/voice/useVoice.ts`
- Modify: `src/client/components/Chat.tsx` (replace `toggleVoice`, pass the disabled reason)
- Modify: `src/client/components/chat/Composer.tsx` (accept and render `voiceDisabledReason`)
- Modify: `.env.example`, `README.md`

**Interfaces:**
- Consumes: `SilenceDetector`, `DEFAULT_SILENCE` (Task 6); `PlaybackQueue` (Task 7); the three HTTP routes (Task 5); `ConversationState` from `@client/components/chat/types`
- Produces:
  - `transcribe(blob: Blob): Promise<string>`
  - `speak(text: string): Promise<Blob>`
  - `getVoiceConfig(): Promise<{ stt: boolean; tts: boolean; reason?: string }>`
  - `startCapture(onDone: (blob: Blob) => void): Promise<() => void>` — resolves to a cancel function
  - `useVoice({ onTranscript, setState }): { supported, disabledReason, listening, toggle, speakReply }`

- [ ] **Step 1: Write the fetch wrappers**

Create `src/client/voice/api.ts`:

```ts
export interface VoiceConfig {
  stt: boolean;
  tts: boolean;
  reason?: string;
}

export async function getVoiceConfig(): Promise<VoiceConfig> {
  const res = await fetch("/api/voice/config");
  if (!res.ok) return { stt: false, tts: false, reason: "Voice unavailable." };
  return (await res.json()) as VoiceConfig;
}

export async function transcribe(blob: Blob): Promise<string> {
  const body = new FormData();
  body.append("audio", blob, "turn.webm");
  const res = await fetch("/api/voice/transcribe", { method: "POST", body });
  const json = (await res.json()) as { text?: string; error?: string };
  if (!res.ok) throw new Error(json.error ?? "Could not transcribe that.");
  return json.text ?? "";
}

export async function speak(text: string): Promise<Blob> {
  const res = await fetch("/api/voice/speak", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(json.error ?? "Could not generate speech.");
  }
  return await res.blob();
}
```

- [ ] **Step 2: Write the capture module**

Create `src/client/voice/capture.ts`:

```ts
import { SilenceDetector } from "./silence";

// The browser half of endpointing: the same MediaStream feeds two consumers —
// MediaRecorder produces the bytes, AnalyserNode produces the volume that
// SilenceDetector reads to decide the turn is over.

const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

export function isCaptureSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator?.mediaDevices?.getUserMedia === "function" &&
    typeof window.MediaRecorder !== "undefined"
  );
}

export async function startCapture(onDone: (blob: Blob) => void): Promise<() => void> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const audioCtx = new AudioContext();
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  audioCtx.createMediaStreamSource(stream).connect(analyser);
  const samples = new Float32Array(analyser.fftSize);

  const detector = new SilenceDetector();
  let frame = 0;
  let finished = false;

  const cleanup = () => {
    cancelAnimationFrame(frame);
    stream.getTracks().forEach((t) => t.stop());
    void audioCtx.close();
  };

  const finish = (emit: boolean) => {
    if (finished) return;
    finished = true;
    cleanup();
    if (recorder.state !== "inactive") recorder.stop();
    if (!emit) chunks.length = 0;
  };

  recorder.onstop = () => {
    if (chunks.length > 0) onDone(new Blob(chunks, { type: recorder.mimeType }));
  };

  const started = performance.now();
  const tick = () => {
    analyser.getFloatTimeDomainData(samples);
    if (detector.push(rms(samples), performance.now() - started) === "done") {
      finish(true);
      return;
    }
    frame = requestAnimationFrame(tick);
  };

  recorder.start(250); // chunk often so a stop never loses the tail
  frame = requestAnimationFrame(tick);

  return () => finish(false); // caller cancels: drop the audio, do not transcribe
}

function rms(samples: Float32Array): number {
  let sum = 0;
  for (const s of samples) sum += s * s;
  return Math.sqrt(sum / samples.length);
}
```

- [ ] **Step 3: Write the hook**

Create `src/client/voice/useVoice.ts`:

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ConversationState } from "@client/components/chat/types";
import { getVoiceConfig, speak, transcribe } from "./api";
import { isCaptureSupported, startCapture } from "./capture";
import { PlaybackQueue } from "./playback";
import { toSpeakable } from "@server/sdk/voice/speakable";

interface Params {
  onTranscript: (text: string) => void | Promise<void>;
  setState: (state: ConversationState) => void;
}

export function useVoice({ onTranscript, setState }: Params) {
  const [supported, setSupported] = useState(false);
  const [disabledReason, setDisabledReason] = useState<string | null>("Checking voice…");
  const [listening, setListening] = useState(false);
  const cancelRef = useRef<(() => void) | null>(null);
  const queueRef = useRef<PlaybackQueue | null>(null);

  useEffect(() => {
    if (!isCaptureSupported()) {
      setDisabledReason("This browser can't record audio.");
      return;
    }
    getVoiceConfig()
      .then((cfg) => {
        // Never fall back to the browser's robot voice: a silent downgrade
        // ships the exact thing the product brief rejected.
        if (cfg.stt && cfg.tts) {
          setSupported(true);
          setDisabledReason(null);
        } else {
          setDisabledReason(cfg.reason ?? "Add a voice API key to enable the mic.");
        }
      })
      .catch(() => setDisabledReason("Voice unavailable."));
  }, []);

  const stopListening = useCallback(() => {
    cancelRef.current?.();
    cancelRef.current = null;
    setListening(false);
    setState("idle");
  }, [setState]);

  const toggle = useCallback(async () => {
    if (listening) {
      stopListening();
      return;
    }
    queueRef.current?.stop(); // talking over the reply cancels it
    setListening(true);
    setState("listening");
    try {
      cancelRef.current = await startCapture(async (blob) => {
        cancelRef.current = null;
        setListening(false);
        setState("thinking");
        try {
          const text = await transcribe(blob);
          if (!text) {
            setState("idle");
            return;
          }
          await onTranscript(text);
        } catch {
          setState("idle");
        }
      });
    } catch {
      // Almost always a denied mic permission.
      setDisabledReason("Microphone permission denied.");
      setListening(false);
      setState("idle");
    }
  }, [listening, onTranscript, setState, stopListening]);

  // Sentence one plays while sentence two is still being generated.
  const speakReply = useCallback(
    async (reply: string) => {
      const sentences = toSpeakable(reply);
      if (sentences.length === 0) return;
      setState("speaking");
      const queue = new PlaybackQueue(playBlob);
      queueRef.current = queue;
      sentences.forEach((sentence, i) => queue.enqueue(i, speak(sentence)));
      await queue.whenDrained();
      queueRef.current = null;
      setState("idle");
    },
    [setState],
  );

  return { supported, disabledReason, listening, toggle, speakReply };
}

function playBlob(clip: Blob): Promise<void> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(clip);
    const audio = new Audio(url);
    const done = () => {
      URL.revokeObjectURL(url);
      resolve();
    };
    audio.onended = done;
    audio.onerror = done;
    void audio.play().catch(done);
  });
}
```

- [ ] **Step 4: Wire it into Chat.tsx**

In `src/client/components/Chat.tsx`, add the import:

```ts
import { useVoice } from "@client/voice/useVoice";
```

Change `send` so it returns the reply text, by replacing this line inside the `try` block:

```ts
      const { reply } = await sendChat(body); // the server holds the history
      setMessages([...next, { role: "assistant", content: reply }]);
      refreshSession(); // they may have just verified their email in-chat
```

with:

```ts
      const { reply } = await sendChat(body); // the server holds the history
      setMessages([...next, { role: "assistant", content: reply }]);
      refreshSession(); // they may have just verified their email in-chat
      return reply;
```

Then replace the placeholder voice handler:

```ts
  // Voice is presentation-only for now: this toggles the state the UI already
  // renders, and is where the speech engine will attach.
  function toggleVoice() {
    setState((s) => (s === "listening" ? "idle" : "listening"));
  }
```

with:

```ts
  // Voice is bookends around the unchanged text pipeline: a transcript goes in
  // through the same send() a typed message uses, and the reply comes back out
  // through TTS. Nothing between them knows which one happened.
  const voice = useVoice({
    setState,
    onTranscript: async (text) => {
      const reply = await send(text);
      if (reply) await voice.speakReply(reply);
    },
  });
```

And pass the reason down, replacing:

```tsx
              onToggleVoice={toggleVoice}
```

with:

```tsx
              onToggleVoice={voice.toggle}
              voiceDisabledReason={voice.disabledReason}
```

- [ ] **Step 5: Render the disabled mic in Composer.tsx**

In `src/client/components/chat/Composer.tsx`, add the prop. Replace lines 9-23:

```tsx
export function Composer({
  value,
  onChange,
  onSend,
  onToggleVoice,
  state,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onToggleVoice: () => void;
  state: ConversationState;
  disabled: boolean;
}) {
```

with:

```tsx
export function Composer({
  value,
  onChange,
  onSend,
  onToggleVoice,
  voiceDisabledReason,
  state,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onToggleVoice: () => void;
  // Non-null means the mic cannot work and this says why, naming the env var.
  voiceDisabledReason?: string | null;
  state: ConversationState;
  disabled: boolean;
}) {
```

Then replace the mic button's opening tag and className, lines 50-61:

```tsx
      <button
        type="button"
        onClick={onToggleVoice}
        aria-pressed={listening}
        aria-label={listening ? "Stop voice input" : "Start voice input"}
        className={
          "grid h-11 w-11 shrink-0 place-items-center rounded-full transition duration-300 ease-glide " +
          "active:scale-[0.94] " +
          (listening
            ? "bg-accent-50 text-accent-700"
            : "text-ink-faint hover:bg-zinc-100 hover:text-ink-soft")
        }
      >
```

with:

```tsx
      <button
        type="button"
        onClick={onToggleVoice}
        disabled={Boolean(voiceDisabledReason)}
        title={voiceDisabledReason ?? undefined}
        aria-pressed={listening}
        aria-label={
          voiceDisabledReason ?? (listening ? "Stop voice input" : "Start voice input")
        }
        className={
          "grid h-11 w-11 shrink-0 place-items-center rounded-full transition duration-300 ease-glide " +
          "active:scale-[0.94] disabled:cursor-not-allowed disabled:opacity-40 " +
          "disabled:hover:bg-transparent disabled:active:scale-100 " +
          (listening
            ? "bg-accent-50 text-accent-700"
            : "text-ink-faint hover:bg-zinc-100 hover:text-ink-soft")
        }
      >
```

Leave the `<svg>`, the `VoiceOrb`, the textarea, and the send button untouched.

- [ ] **Step 6: Document the env block**

Add to `.env.example`, after the AI block:

```
# VOICE ──────────────────────────────────────────────────────────────────────
# Two separate choices: nobody hears the STT, everybody hears the TTS.
# Leave unset and the mic button stays disabled with a reason. There is
# deliberately no browser-speech fallback — it sounds like Google Translate.

# openai | deepgram | browser   (browser = free, Chrome only, no key)
VOICE_STT_PROVIDER=openai
# openai | elevenlabs | deepgram
VOICE_TTS_PROVIDER=openai

# Model ids drift; override if a vendor renames one.
# VOICE_STT_MODEL=whisper-1
# VOICE_TTS_MODEL=gpt-4o-mini-tts
# VOICE_TTS_VOICE=alloy

# elevenlabs.io/app/settings/api-keys — best quality, ~10-20x the cost
# ELEVENLABS_API_KEY=
# console.deepgram.com — cheapest and fastest
# DEEPGRAM_API_KEY=
```

- [ ] **Step 7: Run the whole suite and build**

```bash
npm test
npx tsc --noEmit
npm run build
```
Expected: all tests pass (85 existing + 25 new = 110), clean typecheck, clean build.

- [ ] **Step 8: Manual smoke test (needs a key)**

With `OPENAI_API_KEY` set, run `npm run start:all`, then:

1. Mic button is enabled. (Without a key: disabled, tooltip names `OPENAI_API_KEY`.)
2. Click it, allow the permission prompt, say "what services do you offer".
3. It stops on its own ~800ms after you finish — you do not click again.
4. Your words appear as a user message; the reply appears and is spoken.
5. Speech starts before the full reply has finished being generated.
6. `ls storage/voice/` shows a `.webm`; `git status` still shows clean.
7. Say "book a cleaning with Kate tomorrow" and confirm the booking flow, confirmation guard, and email behave exactly as they do when typed.

Step 7 is the one that matters: it is the evidence that voice added no new correctness surface.

- [ ] **Step 9: Update the README**

Add a "Voice" section: the three-model chain (ears / brain / mouth), the provider table from the spec, why there is no browser-TTS fallback, and the deltas from spec §12. Update the test count from 83 to 110.

- [ ] **Step 10: Commit**

```bash
git add src/client/voice src/client/components/Chat.tsx src/client/components/chat/Composer.tsx .env.example README.md
git commit -m "Wire voice capture and streamed playback into the chat UI"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §2 three models, `runChat` untouched | Global Constraints + Task 8 step 8.7 |
| §3 rule: sdk/ai and domain/booking unmodified | Global Constraints |
| §3 rule: providers behind interfaces | Task 2 |
| §3 rule: audio is not a source of truth | Task 4 |
| §3 rule: missing key degrades visibly | Task 5 (config route) + Task 8 (hook) |
| §4 STT registry incl. `browser` | Task 2 |
| §4 TTS registry, no `browser` row | Task 2 (tested: "refuses browser as a TTS provider") |
| §5 interfaces | Task 2 |
| §6 data flow steps 1-3 (capture, VAD) | Tasks 6, 8 |
| §6 steps 4-5 (upload, STT) | Tasks 5, 8 |
| §6 step 6 (unchanged chat) | Task 8 step 4 |
| §6 steps 7-9 (split, speak, queue) | Tasks 1, 7, 8 |
| §7 sentence-chunked streaming | Tasks 1, 7 |
| §8 storage, gitignored | Task 4 |
| §9 file layout | matches, with `speakable.ts` and `api.ts` added |
| §10 failure modes table | Task 5 (503/400/413/502), Task 8 (permission, unsupported) |
| §11 testing | Tasks 1, 2, 4, 6, 7 |
| §12 deltas | Task 8 step 9 |

Two files were added beyond spec §9: `speakable.ts` (server-side, so the sentence rules live next to the TTS that consumes them) and `client/voice/api.ts` (fetch wrappers kept out of the hook). Both are decomposition, not scope.

**Placeholder scan:** no TBDs. Every code step carries the code. Step 8.5 was prose on the first pass and has been replaced with the exact before/after blocks from the current `Composer.tsx`.

**Type consistency:** `SpeechToText.transcribe(Uint8Array, string)` and `TextToSpeech.speak(string, string?)` are used identically in Tasks 2, 3, 5. `PlaybackQueue.enqueue(number, Promise<Blob>)` in Task 7 matches its use in Task 8. `toSpeakable` from Task 1 is imported in Task 8 with the signature Task 1 defines. `SilenceDetector.push(level, atMs)` in Task 6 matches Task 8's capture loop.

**One thing the implementer must confirm:** `useVoice.ts` imports `toSpeakable` from `@server/...` into client code. It is a pure function with no Node imports, so it bundles fine — but if the Next build complains, move `speakable.ts` to `src/shared/` and update the two importers plus the test.
