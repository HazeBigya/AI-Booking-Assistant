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
app at http://localhost:3000. Stop with `Ctrl+C`; wipe the database with
`npm run reset`.

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
  auth/                  email-OTP, JWT session, find-or-create patient
  db/                    drizzle schema, migrations, queries, seed
  shared/                rate limiting
src/client/
  api/                   the only place that does HTTP (generic fetcher)
  components/            UI (never call fetch directly)
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

## Tests

```bash
npm test        # 82 tests: pure booking core, clinic-timezone conversion,
                # tool-dispatch guards, the fabricated-confirmation guard,
                # provider config resolution, .ics builder, fallback chain,
                # rate limiter, output validator
```

No database is required — DB-touching paths are covered by pure logic and the
tool-layer guard branches that short-circuit before I/O.

## Documented simplifications

- The clinic runs on one time zone (`CLINIC_TIMEZONE`, IANA name). Instants are
  stored in UTC; opening hours, the slot grid and every label shown to a patient
  are evaluated on that clock via `Intl`, so DST is handled by the tz database.
  The browser also reports the *patient's* zone with each message — validated
  server-side, and used only to add "your local time" alongside the clinic time.
  It never shifts opening hours: those belong to the clinic, not the visitor.
  `.ics` uses floating time.
- Rate limiting is in-memory (single instance); Redis is the scale path.
- Cancelling is implemented (soft cancel: `status = 'cancelled'` frees the slot via
  the partial constraint and keeps history, plus an `.ics` `METHOD:CANCEL`).
  Rescheduling is not — today it is cancel, then book again.
- Choosing the *correct dentist* from free text is model-dependent (mitigated by
  the system prompt + a swappable stronger model); every other booking invariant
  is enforced deterministically.
- Voice is a documented seam only: STT in front of / TTS behind the same
  transport-agnostic chat service.
