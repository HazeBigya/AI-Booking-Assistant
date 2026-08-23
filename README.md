# Dental Clinic AI Receptionist

A chatbot that acts as a dental clinic receptionist: it holds a natural
conversation, understands intent (typos, synonyms), and helps a patient discover
services, compare dentists, check availability, and book — **without ever
deciding availability or booking itself.** The AI calls deterministic backend
functions ("tools"); correctness lives in code and in the database.

## Quick start (one command)

Prerequisites: Docker Desktop running, and an API key for OpenAI **or** DeepSeek.

```bash
cp .env.example .env      # then set LLM_PROVIDER + the matching API key
docker compose up
```

On `up`: Postgres starts, the `migrate` service applies the schema + seed, then
the app boots at http://localhost:3000. No manual database steps.

### Local development (app on host, DB in Docker)

```bash
cp .env.example .env      # set DATABASE_URL to localhost + your API key
docker compose up -d db
npm install
npm run db:migrate
npm run db:seed
npm run dev               # http://localhost:3000
```

## Environment

| Var | Purpose |
|-----|---------|
| `LLM_PROVIDER` | `openai`, `deepseek`, or `bedrock` (default `openai`) |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | used when provider is `openai` |
| `DEEPSEEK_API_KEY` / `DEEPSEEK_MODEL` | used when provider is `deepseek` |
| `AWS_REGION` / `BEDROCK_MODEL_ID` | used when provider is `bedrock` (creds via AWS chain) |
| `DATABASE_URL` | Postgres connection (localhost for host dev) |

## Architecture

```
app/                     Next.js routing only (thin route -> controller)
src/server/
  controllers/           validate + delegate + shape response (no logic)
  services/              chat-service: guardrail pipeline around the loop
  domain/booking/        PURE scheduling core — imports nothing external
  sdk/ai/                providers (LLM seam), tools + dispatch, loop, guardrails
  sdk/calendar/          calendar seam (stubs)
  db/                    drizzle schema, migrations, queries, seed
  shared/                rate limiting
src/client/
  api/                   the only place that does HTTP (generic fetcher)
  components/            UI (never call fetch directly)
drizzle/                 generated migrations + custom double-booking guard
```

### Design decisions worth knowing

- **The AI never decides correctness.** Availability, capability, and
  double-booking are enforced in `domain/booking` (pure functions) and by the
  database. The model only *presents* data returned by tools.
- **No hallucination (grounding).** Every clinic fact (services, prices,
  dentists, expertise, availability) comes from the DB via tools. The system
  prompt forbids answering from the model's own knowledge or browsing the web.
- **Anti-jailbreak, layered:** (1) a separate enum-only intent gate that treats
  user text as data to classify, short-circuiting off-topic requests before the
  main call; (2) a strict system prompt; (3) an output validator. The model can
  only *act* through validated tools.
- **Double-booking is impossible.** A Postgres `EXCLUDE USING gist` constraint
  rejects overlapping bookings per dentist, even under concurrent requests. The
  app also checks first for a friendly message; correctness lives in the DB.
- **Provider-agnostic.** The LLM sits behind a neutral `LLMProvider` interface.
  Three adapters ship: OpenAI and DeepSeek (one adapter, shared OpenAI wire
  format, different `baseURL`) and Amazon Bedrock (Converse API). Switch with one
  env var (`LLM_PROVIDER`), no code change; adding a vendor = one new adapter.
- **SQL injection has no path.** The model emits typed tool arguments (validated
  with zod), never SQL; queries are parametrized via Drizzle.

## Tests

```bash
npm test        # 26 unit tests for the pure booking core (no DB needed)
```

## Documented simplifications

- UTC is treated as clinic-local (single timezone).
- Conversation state is client-held (stateless server). The `chat_sessions` /
  `chat_messages` tables exist for server-side persistence but aren't wired yet.
- Rate limiting is in-memory (single instance); Redis is the scale path.
- Auth (passwordless email OTP), calendar sync, and reschedule/cancel are
  designed (schema + seams in place) but not yet implemented.
- Voice is a documented seam only: STT in front of / TTS behind the same
  transport-agnostic chat service.
```
