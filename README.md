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

Prerequisites: Docker Desktop, and one AI API key (DeepSeek is cheapest; OpenAI
also works).

```bash
cp .env.example .env      # set LLM_PROVIDERS + the matching API key
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
| `LLM_PROVIDERS` | Comma-separated fallback chain, tried in order (e.g. `deepseek,openrouter:model`). Each entry is `provider` or `provider:model`. Providers with missing keys are skipped. |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | used for `openai` |
| `DEEPSEEK_API_KEY` / `DEEPSEEK_MODEL` | used for `deepseek` |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | used for `gemini` (native `@google/genai`) |
| `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` | used for `openrouter` (gateway to many models) |
| `AWS_REGION` / `BEDROCK_MODEL_ID` | used for `bedrock` (creds via the AWS chain) |
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
- **Provider-agnostic with a fallback chain.** The LLM sits behind a neutral
  `LLMProvider` interface. Adapters: OpenAI + DeepSeek + OpenRouter (shared
  OpenAI wire format, different `baseURL`), Gemini (native SDK), and Bedrock
  (Converse). `LLM_PROVIDERS` composes a priority chain; if all fail, the bot
  returns an honest "can't connect" message. Adding a vendor = one adapter.
- **SQL injection has no path.** The model emits typed tool arguments (validated
  with zod), never SQL; queries are parametrized via Drizzle. Money is stored as
  integer dollars.

## Tests

```bash
npm test        # 49 tests: pure booking core, tool-dispatch guards,
                # .ics builder, fallback chain, rate limiter, output validator
```

No database is required — DB-touching paths are covered by pure logic and the
tool-layer guard branches that short-circuit before I/O.

## Documented simplifications

- UTC is treated as clinic-local (single timezone); `.ics` uses floating time.
- Rate limiting is in-memory (single instance); Redis is the scale path.
- Reschedule/cancel is modeled (`status = booked | cancelled`) but has no flow yet.
- Choosing the *correct dentist* from free text is model-dependent (mitigated by
  the system prompt + a swappable stronger model); every other booking invariant
  is enforced deterministically.
- Voice is a documented seam only: STT in front of / TTS behind the same
  transport-agnostic chat service.
