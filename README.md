# Dental Clinic AI Receptionist

A chatbot that acts as a dental clinic receptionist: it holds a natural
conversation, understands intent (typos, synonyms), and helps a patient discover
services, compare dentists, check availability, verify their email, and book —
**without ever deciding availability or booking itself.** The AI calls
deterministic backend functions ("tools"); correctness lives in code and in the
database.

> New to running projects? See **[SETUP.md](./SETUP.md)** for a step-by-step
> guide (install Docker, add one key, run one command).

## Quick start (one command)

Prerequisites: Docker Desktop, and one AI API key from any supported provider —
OpenAI, Anthropic, DeepSeek, Gemini, OpenRouter, or any OpenAI-compatible
endpoint. DeepSeek is cheapest for a demo.

```bash
cp .env.example .env      # set AI_PROVIDER + that provider's API key
npm run start:all         # starts Docker, Postgres, migrate+seed, and the app
```

`start:all` launches Docker if needed, then `docker compose up` brings up
Postgres, runs the one-shot `migrate` service (schema + seed), and starts the
app at http://localhost:3000. Stop with `Ctrl+C`.

Two separate database commands, so the safe one can never be the destructive
one: `npm run setup` builds and seeds and is safe to re-run; `npm run destroy`
deletes the volume and asks for typed confirmation first.

### Local development (fast loop: app on host, DB in Docker)

```bash
docker compose up -d db
npm install
npm run db:migrate && npm run db:seed
npm run dev               # http://localhost:3000, hot reload
```

## Environment

| Var | Purpose |
|-----|---------|
| `AI_PROVIDER` | Which provider to use: `anthropic`, `openai`, `gemini`, `deepseek`, `openrouter`, `custom`. A comma-separated list is a **failover chain in that order** (`anthropic,deepseek`); an entry may pin a model inline (`openrouter:z-ai/glm-5.2:free`, split on the first colon so ids may contain `:`). Entries whose key is missing are skipped. `LLM_PROVIDERS` is a backwards-compatible alias. |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` / `DEEPSEEK_API_KEY` / `OPENROUTER_API_KEY` (+ matching `*_MODEL`) | one key per vendor — which is what lets several be configured at once for failover |
| `CUSTOM_BASE_URL` / `CUSTOM_API_KEY` / `CUSTOM_MODEL` | with `AI_PROVIDER=custom`: any OpenAI-compatible endpoint (Qwen, Kimi, Groq, local Ollama/vLLM) |
| `AWS_REGION` / `BEDROCK_MODEL_ID` | used for `bedrock` (creds via the AWS chain, native adapter) |
| `VOICE_PROVIDER` | one vendor for both ears and mouth: `openai` (default), `elevenlabs`, `deepgram`. Enough on its own for any of them |
| `VOICE_STT_PROVIDER` | overrides the ears only: `openai`, `elevenlabs`, `deepgram`, `browser` (free, Chrome only, no key) |
| `VOICE_TTS_PROVIDER` | overrides the mouth only: `openai`, `elevenlabs`, `deepgram`. No `browser` row on purpose — see Voice below |
| `ELEVENLABS_API_KEY` / `DEEPGRAM_API_KEY` (+ `VOICE_STT_MODEL` / `VOICE_TTS_MODEL`) | one key per speech vendor; model ids are overridable because vendors rename them. The voice itself is not configurable — see Voice below |
| `CLINIC_TIMEZONE` | IANA name for the clinic's wall clock — sets opening hours and which slots exist |
| `AUTH_SECRET` | signs the session JWT |
| `SMTP_*` / `RESEND_API_KEY` / `MAIL_FROM` | email transport for OTP codes + calendar invites (falls back to console) |
| `DATABASE_URL` | Postgres connection (localhost for host dev) |

## Architecture

```
app/                     Next.js routing only (thin route -> controller)
src/server/
  controllers/           validate + delegate + shape response (no logic)
  services/              chat-service: history + guardrail pipeline around the loop
  domain/booking/        PURE scheduling core — imports nothing external
  sdk/ai/                providers (LLM seam), tools + dispatch, loop, guardrails
  sdk/mailer/            email seam: console / SMTP / Resend, + .ics builder
  sdk/voice/             speech seam: OpenAI / ElevenLabs / Deepgram
  auth/                  email-OTP, JWT session, find-or-create patient
  db/                    drizzle schema, migrations, queries, seed
  shared/                rate limiting
src/client/
  api/                   the only place that does HTTP (generic fetcher)
  components/            UI (never call fetch directly)
  voice/                 mic capture, silence detection, sentence split, playback queue
drizzle/                 generated migrations + custom double-booking guard
```

### Design decisions worth knowing

- **The AI never decides correctness.** Availability, capability, double-booking,
  and past-time rejection are enforced in `domain/booking` (pure functions), the
  tool layer, and the database. The model only *presents* data returned by tools;
  it can misspeak but cannot violate an invariant.
- **No hallucination (grounding).** Every clinic fact (services, prices, dentists,
  expertise, availability) comes from the DB via tools. The system prompt forbids
  answering from the model's own knowledge or browsing the web.
- **Anti-jailbreak, layered:** a strict system prompt, tools-only actions, and an
  output validator (blocks code output). User text is data, never instructions.
- **Double-booking is impossible.** A Postgres `EXCLUDE USING gist` constraint
  rejects overlapping bookings per dentist, even under concurrent requests. The
  app also checks first for a friendly message; the DB is the real guarantee. A
  patient also can't be booked into two overlapping slots.
- **Passwordless auth, inline in chat.** The patient verifies their email with a
  6-digit code via a deterministic `verify_login_code` tool — the model only
  relays the code, it never judges it (prompt-injection safe). A JWT httpOnly
  session then gates booking and appointment lookup. Identity comes from the
  session, never a model-supplied email (no IDOR).
- **Grounded, tamper-proof bookings.** A booking is made under the verified
  session email; `patient_id` and the `price` (per-dentist override or base) are
  snapshotted from authoritative tables at write time. A `.ics` calendar invite is
  emailed to both patient and dentist — no per-vendor OAuth.
- **Server-authoritative chat.** Each turn is persisted to `chat_messages` (with
  token usage); the last 15 are loaded for context and restored on refresh. A
  session is linked to its patient once the email is verified.
- **Bring your own AI.** The LLM sits behind a neutral `LLMProvider` interface.
  Most vendors expose an OpenAI-compatible endpoint, so one adapter serves
  OpenAI, Anthropic, DeepSeek, Gemini and OpenRouter — **adding a vendor is a row
  in a table, not an adapter** — and `custom` + `CUSTOM_BASE_URL` reaches any
  compatible endpoint (Qwen, Kimi, Groq, local Ollama) with no code change at
  all. Bedrock keeps a native Converse adapter, which is also what proves the
  seam isn't secretly OpenAI-shaped. `LLM_PROVIDERS` composes a failover chain;
  if every provider fails the bot returns an honest "can't connect" message.
  Model choice never affects correctness — see the guardrails above.
- **SQL injection has no path.** The model emits typed tool arguments (validated
  with zod), never SQL; queries are parametrized via Drizzle. Money is stored as
  integer dollars.

## Voice

Three models in a chain, and only the middle one thinks:

| Stage | Job | Model | Knows about dentists? |
|---|---|---|---|
| Ears | audio → text | STT (`whisper-1` by default) | no |
| Brain | text → reply + tool calls | **the existing chat loop, unchanged** | yes |
| Mouth | text → audio | TTS (`tts-1-hd`, voice `shimmer`, by default) | no |

The speech models never see a tool schema, never touch the database, and never
decide anything. STT turns a recording into the same string the text box would
have produced, so from that point a spoken booking is indistinguishable from a
typed one — and is guarded by the same `tstzrange` exclusion constraint.
**Voice adds no new correctness surface.**

Voice resolves independently of `AI_PROVIDER`, because the chat vendor may sell
no speech at all — running `AI_PROVIDER=deepseek` with `VOICE_PROVIDER=openai`
is the normal case, not a workaround. One `VOICE_PROVIDER` covers both halves
(`openai`, `elevenlabs`, `deepgram` each sell both, and each bills them
separately, so using one half obliges nothing about the other).
`VOICE_STT_PROVIDER` and `VOICE_TTS_PROVIDER` override one half each — to mix
vendors, or because `browser` listens but is deliberately refused as a voice.

**Why there is no browser-speech fallback.** The browser's built-in
`speechSynthesis` is free and needs no key, and it is also the flat robotic
voice people recognise from Google Translate. Falling back to it when a key is
missing would silently ship the worst version of the feature while appearing to
work, so a missing key disables the mic button with a message naming the
variable to set instead. `browser` *is* offered for STT: nobody hears the ears,
so cheap transcription costs accuracy that the booking confirmation already
catches, while a cheap voice costs the product its personality and nothing
catches that.

**Latency.** Waiting for the full reply before speaking leaves 4-6 seconds of
dead air, most of it the tool loop rather than the speech models. Instead the
reply is stripped of markdown and split at sentence boundaries, and each
sentence is spoken as it is produced:

> "Kate's free from 11:30." ← plays now
> "Want me to book it?"     ← generated during that playback

Speaking one sentence takes longer than generating the next, so the queue stays
fed and the perceived gap drops to roughly 1.5 seconds. An indexed FIFO queue
keeps playback in order — a short sentence returns from TTS before a long
earlier one, so without it the reply would play back scrambled.

**Recordings are never kept.** Audio is transcribed and dropped. The transcript
is stored as an ordinary chat message and is the whole record of the turn, so
holding the audio as well would add nothing the product reads back — only a
patient's voice on a disk with no retention window and no deletion path.

## Chat history

Every message is stored, but only the **last 15** are sent to the model
(`chat-service.ts`). That number is small on purpose.

A general assistant needs a deep window because the conversation *is* the
product. Here it is not: the booking is, and the booking lives in Postgres. A
patient who asks "when is my appointment?" thirty turns later is answered by
`list_my_appointments` reading the database — not by the model recalling the
transcript. Identity persists the same way, in the session cookie and
`chat_sessions.patient_id`. **Tools are the memory; the transcript only carries
recent phrasing.**

So a longer window buys nothing and costs twice: more tokens on every turn, and
more surrounding text for a weak model to lose the auth line in — the failure
this codebase already works to prevent by repeating that line first and last.

Tool results are never persisted, so 15 rows means 15 real exchanges, not 15
slots half-consumed by a booking flow. The full transcript is still returned to
the browser by `/api/chat/history`, which is what repopulates the window on
reload; only what the *model* sees is trimmed.

## Tests

```bash
npm test        # 127 tests: pure booking core, clinic-timezone conversion,
                # tool-dispatch guards, the fabricated-confirmation guard,
                # provider config resolution, .ics builder, fallback chain,
                # rate limiter, output validator, tool-payload redaction, and
                # the voice layer (sentence splitting, provider resolution,
                # silence detection, playback ordering)
```

```bash
npm run lint         # eslint (next/core-web-vitals)
npm run format:check # prettier, code only — markdown is excluded because it
                     # pads table cells to the width of the widest one
```

Three blocks carry `// prettier-ignore` where column alignment is load-bearing
and the formatter's output is strictly less readable.

No database is required — DB-touching paths are covered by pure logic and the
tool-layer guard branches that short-circuit before I/O. No API key is required
either: every speech vendor sits behind an interface, so the voice tests cover
resolution and sequencing without touching the network.

## Documented simplifications

- The clinic runs on one time zone (`CLINIC_TIMEZONE`, IANA name). Instants are
  stored in UTC; opening hours, the slot grid and every label shown to a patient
  are evaluated on that clock via `Intl`, so DST is handled by the tz database.
  The browser also reports the *patient's* zone with each message — validated
  server-side, and used only to add "your local time" alongside the clinic time.
  It never shifts opening hours: those belong to the clinic, not the visitor.
  `.ics` carries absolute UTC (`DTSTART:...Z`), so every calendar renders the
  appointment in its own viewer's zone.
- Rate limiting is in-memory (single instance); Redis is the scale path.
- Cancelling is implemented (soft cancel: `status = 'cancelled'` frees the slot via
  the partial constraint and keeps history, plus an `.ics` `METHOD:CANCEL`).
  Rescheduling is not — today it is cancel, then book again.
- Choosing the *correct dentist* from free text is model-dependent (mitigated by
  the system prompt + a swappable stronger model); every other booking invariant
  is enforced deterministically.
- Voice is push-to-start with automatic endpointing: the turn ends itself after
  ~800ms of silence. Full-duplex barge-in — interrupting the bot mid-sentence,
  as the ElevenLabs demo does — needs bidirectional streaming and cancellation
  threaded through the tool loop, and is not built.
- Voice selection is one env var, not an in-app picker.
- The model sees the last 15 messages, not the whole conversation. Durable state
  lives in Postgres and is fetched by tools, so the transcript only has to carry
  recent phrasing — see Chat history below.
