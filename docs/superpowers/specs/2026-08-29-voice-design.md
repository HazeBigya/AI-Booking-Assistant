# Voice Layer — Design

Date: 2026-08-29
Status: Approved for planning

## 1. Purpose

Let a patient hold the same booking conversation by talking instead of typing.
The mic button and the `listening`/`speaking` states already exist in the UI
and do nothing; this makes them real.

Requirement source — Alessandro's email:

> With regards of the AI provider you can let the user chose. Just have the API
> connectors ready and the instruction on how to get / install the API key. The
> user should pay for the cost of AI and decide the level of quality. For the
> voice AI, you can check an example of Eleven labs chat bot. The AI is indeed
> conversational, no point of having the mechanical voice from Google Translate.
> (No need to use elevenlabs as provider).

Three things follow, and they shape everything below:

1. Voice is **bring-your-own-key**, same as `AI_PROVIDER`.
2. The browser's built-in `speechSynthesis` is **disqualified** — that IS the
   Google Translate voice he named. A real neural TTS model or nothing.
3. ElevenLabs is the **quality bar, not a required purchase**. Ship a connector,
   default to something else.

## 2. Mental model: three models, not one

| Stage | Job | Model | Knows about dentists? |
|---|---|---|---|
| Ears | audio → text | STT (Whisper) | No |
| Brain | text → reply + tool calls | **existing `runChat`** | Yes |
| Mouth | text → audio | TTS | No |

The voice models are deaf-and-dumb converters. They never see a tool schema,
never touch the database, never decide anything. Whisper turns noise into the
same string the text box would have produced, and from that point the request
is indistinguishable from a typed one.

**Consequence: voice adds zero new correctness surface.** A booking made by
voice is guarded by the same `tstzrange` exclusion constraint as a typed one.
This is why the feature is safe to add late.

## 3. Non-negotiable rules

- **`runChat` is not modified.** No voice-aware branch in the tool loop, no
  voice flag in the prompt. Voice is bookends around an unchanged core.
- **`/server/domain/booking` stays ignorant of voice**, same rule as AI.
- **Speech providers sit behind interfaces** in `sdk/voice/`, mirroring
  `sdk/ai/providers/`. A new vendor is a table row.
- **No audio is a source of truth.** Recordings are debug artifacts. Losing
  `storage/voice/` loses nothing.
- **Missing voice key degrades visibly, never silently.** The mic button is
  disabled with a reason. It must never fall back to a robot voice — a silent
  downgrade to the exact thing the client rejected is worse than no feature.

## 4. Provider design

Two independent choices, because they are separate products with separate
prices and nobody is required to buy both from one vendor. They are also
separate from `AI_PROVIDER`: the reasoning vendor (DeepSeek by default here)
sells no speech models, and that is fine.

```
AI_PROVIDER=deepseek           # unchanged — the brain
VOICE_STT_PROVIDER=openai      # the ears
VOICE_TTS_PROVIDER=openai      # the mouth
```

### STT registry

| Value | Model | Key | Note |
|---|---|---|---|
| `openai` (default) | `whisper-1` | `OPENAI_API_KEY` | accurate, ~$0.006/min |
| `deepgram` | `nova-3` | `DEEPGRAM_API_KEY` | cheapest, fastest |
| `browser` | Web Speech API | none | free, Chrome-only, no key |

`browser` survives here and not in TTS on purpose: **the client complained
about the voice, not the ears.** Nobody hears the STT. Poor STT costs accuracy,
which the confirmation step already catches; poor TTS costs the product its
personality, which nothing catches.

### TTS registry

| Value | Model | Key | Note |
|---|---|---|---|
| `openai` (default) | `gpt-4o-mini-tts` | `OPENAI_API_KEY` | conversational, cheap |
| `elevenlabs` | `eleven_flash_v2_5` | `ELEVENLABS_API_KEY` | best quality, ~10-20x cost |
| `deepgram` | `aura-2` | `DEEPGRAM_API_KEY` | lowest latency |

No `browser` row. See rule 5 in §3.

**Default is OpenAI, not ElevenLabs.** One key, already required by half the
existing README, and `gpt-4o-mini-tts` is clearly above the mechanical bar.
Shipping the connector while defaulting elsewhere answers the requirement
better than adopting the vendor would: it demonstrates the seam.

## 5. Interfaces

```ts
// sdk/voice/types.ts — vendor-neutral, the only thing routes import
export interface SpeechToText {
  readonly name: string;
  transcribe(audio: Uint8Array, mimeType: string): Promise<string>;
}

export interface TextToSpeech {
  readonly name: string;
  speak(text: string, voice?: string): Promise<{ audio: Uint8Array; mimeType: string }>;
}
```

Resolution mirrors `sdk/ai/providers/index.ts`: a `Record<string, Vendor>` of
label + baseURL + keyEnv, one `get*Provider()` with a cached instance, and an
error message that names the exact env var to set.

## 6. Data flow

```
1. getUserMedia()                    permission prompt, once
2. MediaRecorder (webm/opus)         ~4 KB/s; 5s speech ≈ 20 KB
3. AnalyserNode volume watch         <threshold for 800ms → recorder.stop()
4. POST /api/voice/transcribe        multipart, one Blob
5. SpeechToText.transcribe()         → "book a cleaning with Kate on Friday"
6. POST /api/chat  [UNCHANGED]       existing prompt, tools, guard, DB
7. reply text → split at sentences
8. POST /api/voice/speak  (per sentence)
9. queue + play in order             audio/mpeg via URL.createObjectURL
```

Step 3 is what makes this tier 2 (auto-endpointing) rather than tier 1
(push-to-talk walkie-talkie). It is ~30 lines of WebAudio, no ML.

`ConversationState` (`idle | listening | thinking | speaking`) already exists
and already drives the orb. Steps map onto it directly; no new UI state.

## 7. Latency, and the one trick

Naive: wait for the whole reply, then speak it.

| Stage | ms |
|---|---|
| VAD endpoint | 800 |
| upload 20 KB | 100 |
| STT | 400 |
| **chat loop (~2 model calls)** | **1500-3000** |
| TTS whole reply | 800 |
| **dead air** | **~4-6s** |

Note the bulk is the *existing tool loop*, not the voice parts.

**Chosen: sentence-chunked streaming.** Split the reply at sentence boundaries;
send sentence 1 to TTS immediately and start playing it while later sentences
are still being generated.

> "Kate's free from 11:30."   ← plays now
> "Want me to book it?"       ← generated during playback

Sentence 1 takes ~2s to speak, far more than the ~800ms the rest needs.
Perceived gap drops ~5s → ~1.5s. Still plain HTTP, no WebSocket. A small
FIFO queue guarantees ordering so sentence 2 can never overtake sentence 1.

Rejected: full-duplex WebSocket streaming with barge-in. Best experience,
wrong risk for the deadline. Documented as a delta.

## 8. Storage

`VoiceStore` seam, local-disk implementation, written to `storage/voice/`,
which is **gitignored**. Files named `<sessionId>/<timestamp>.webm`.

Purpose is debugging ("it heard 'Kate' as 'eight'") and demo replay. Nothing
reads it in the request path. The seam exists so S3 is a swap, not a rewrite;
that is stated in the docs as a delta rather than built.

## 9. File layout

```
src/server/sdk/voice/
  types.ts          SpeechToText, TextToSpeech
  index.ts          registry + cached resolution
  openai.ts         whisper-1 + gpt-4o-mini-tts
  elevenlabs.ts
  deepgram.ts
  store.ts          VoiceStore → storage/voice/
app/api/voice/transcribe/route.ts
app/api/voice/speak/route.ts
src/client/voice/
  capture.ts        getUserMedia + MediaRecorder
  vad.ts            AnalyserNode silence detection
  playback.ts       ordered audio queue
  sentences.ts      reply → sentence chunks
```

Nothing under `src/server/domain/` changes. `sdk/ai/` does not change.

## 10. Failure modes

| Condition | Behaviour |
|---|---|
| No voice key configured | Mic button disabled, tooltip names the env var |
| Mic permission denied | Inline message, text input keeps working |
| STT returns empty string | "Didn't catch that" — no chat call made |
| TTS request fails | Reply still renders as text; no silent hang |
| Browser lacks MediaRecorder | Mic button hidden |

Text chat must work with the entire voice layer removed.

## 11. Testing

Unit, no network:
- `sentences.ts` — splitting on `.`/`?`/`!`, not on `Dr.` or `11:30 a.m.`
- registry resolution — unknown provider, missing key, correct error text
- `playback.ts` ordering — out-of-order arrivals still play 1,2,3
- VAD threshold logic against a synthetic volume series

Provider calls are mocked. Real speech quality is judged by ear, not by test.

## 12. Deltas (documented, not built)

- Full-duplex streaming + barge-in (the ElevenLabs demo tier)
- Voice selection UI (pick the speaker's voice/accent)
- S3-backed `VoiceStore`
- Multilingual STT with auto language detection
- Per-user provider settings in-app instead of `.env`

## 13. Estimate

| Piece | h |
|---|---|
| `sdk/voice/` types, registry, openai.ts | 1.5 |
| transcribe + speak routes | 1.0 |
| capture + VAD | 2.0 |
| sentence chunking + playback queue | 2.0 |
| wire to existing ConversationState | 1.0 |
| elevenlabs.ts + deepgram.ts | 1.0 |
| tests + docs + .gitignore | 1.5 |
| **total** | **~10** |

Riskiest hours: VAD threshold tuning (over-sensitive cuts the speaker off,
under-sensitive adds dead air) and playback ordering. Both are fiddly in the
browser, neither is conceptually hard.
