# Dental Clinic AI Receptionist — Architecture Design

Date: 2026-08-22
Status: Approved for planning

## 1. Purpose

An AI chatbot that acts as a dental clinic receptionist. It holds a natural
conversation and helps a patient:

1. discover services,
2. find which dentists provide a chosen service (with their expertise/level),
3. check a specific dentist's open slots on a day,
4. book an appointment,
5. log in and view their own appointments.

The AI understands intent (typos, synonyms, "brighten my teeth" -> teeth
whitening) but **never decides availability or booking itself**. It calls
deterministic backend functions ("tools"). Availability, capability, and
double-booking are enforced in code and at the database, never trusted from
model output.

The bot must refuse everything outside this scope. Answering an off-topic
request (e.g. "write me Python", medical diagnosis, general trivia) is a
product failure and will be adversarially tested.

## 2. Non-negotiable architectural rules

- **`/lib/booking` never imports `/lib/ai`.** Booking logic has zero knowledge
  of the AI. The AI is one consumer of booking functions. This is a safety
  boundary: model output is never trusted for correctness.
- **The DB is the single source of truth for availability and double-booking.**
  External calendars are an outbound side-effect, never in the decision path.
- **Provider-agnostic seams.** The LLM vendor and the calendar vendor are both
  behind interfaces. Swapping OpenAI -> Bedrock, or adding Zoho, changes no
  upstream code.
- **The model never emits SQL.** It calls typed tool functions with typed args;
  the DB layer runs parametrized queries. SQL injection has no path.

## 3. Runtime & stack

- Next.js 14 App Router + TypeScript, Tailwind.
- PostgreSQL in Docker (single `docker compose up`).
- Drizzle ORM for queries + schema types. Raw SQL retained for the
  `btree_gist` + `EXCLUDE USING gist` double-booking constraint (Drizzle cannot
  model it).
- OpenAI via the official SDK, behind a provider interface. No LangChain.
- Runs with only `OPENAI_API_KEY`. Email/calendar creds are optional; without
  them, OTP prints to the server console and calendar events are logged.

## 4. Module map (vocabulary mapped to Next.js idioms)

```
app/api/chat/route.ts         controller (thin): parse, rate-limit, call service, map errors
app/api/auth/*/route.ts       controller: request-otp, verify-otp, logout
app/api/appointments/route.ts controller: list current patient's bookings (auth-gated)

lib/ai/providers/types.ts     LLMProvider interface + PROVIDER-NEUTRAL message/tool/usage types
lib/ai/providers/openai.ts    OpenAI adapter (neutral <-> OpenAI wire format)
lib/ai/providers/index.ts     factory: env LLM_PROVIDER selects the adapter

lib/ai/guardrails/intent-gate.ts      cheap classify -> enum; out_of_scope short-circuits
lib/ai/guardrails/system-prompt.ts    strict scope prompt for the main model
lib/ai/guardrails/output-validator.ts reject code fences / off-topic drift
lib/ai/guardrails/refusals.ts         canned deterministic refusals

lib/ai/tools/schemas.ts       neutral tool defs
lib/ai/tools/dispatch.ts      tool name -> lib/booking call, args validated with zod
lib/ai/services/chat.ts       hand-written tool-calling loop (transport-agnostic: text or voice)

lib/booking/*                 UNCHANGED pure core (rules, availability, ports, scheduler)
                              + new scheduler.findAvailabilityForProfessional()

lib/db/schema.ts              drizzle table defs
lib/db/client.ts              drizzle(pool)
lib/db/queries.ts             BookingRepository impl via drizzle + patient/otp queries

lib/calendar/types.ts         CalendarProvider interface (createEvent{attendees}, isBusy)
lib/calendar/registry.ts      name -> adapter map; register()/resolve()
lib/calendar/{google,outlook,zoho}.ts  adapters (documented stubs, real behind env)
lib/calendar/noop.ts          dev default: logs the event

lib/auth/otp.ts               generate/verify 6-digit OTP (hashed, single-use, expiry)
lib/auth/session.ts           sign/verify httpOnly JWT session cookie
lib/auth/mailer.ts            send OTP email; console fallback in dev

lib/shared/rate-limit.ts      in-memory token-bucket Map<key,...>
lib/shared/tokens.ts          aggregate usage.total_tokens per-session + global; optional cap
lib/shared/types.ts           shared cross-cutting types
lib/shared/helpers.ts         small pure utilities

app/page.tsx, app/layout.tsx, app/globals.css
components/{ChatWindow,Message,ChatInput,LoginPanel,AppointmentsList}.tsx

tests/booking.test.ts         existing 22 tests (stay green)
tests/golden/cases.json       scope eval cases {input, expect, note}
tests/golden.test.ts          runs pipeline over cases with a MOCKED provider (offline, CI-safe)
scripts/eval-live.ts          opt-in: hits the REAL classifier, prints scope accuracy
```

## 5. Data model changes

Existing: `professionals`, `services`, `professional_services`, `bookings`
(with the `EXCLUDE USING gist` guard). Changes:

- `professionals` gains `calendar_provider TEXT` (e.g. 'google'|'outlook'|'zoho'|'noop')
  and `calendar_id TEXT` — which external calendar to write events to.
- New `patients(id, name, email UNIQUE, created_at)`.
- `bookings` gains `patient_id INTEGER REFERENCES patients(id)` (kept alongside
  existing `patient_name`/`patient_email` snapshot fields).
- New `otp_codes(email, code_hash, expires_at, consumed_at)` — short-lived,
  single-use login codes. (May be in-memory; a table is chosen so it survives
  a restart and is inspectable.)

Migrations stay raw SQL under `db/migrations` (auto-run on fresh volume). Drizzle
schema in `lib/db/schema.ts` mirrors the tables for type-safe queries; the
`EXCLUDE`/`btree_gist` DDL remains in the SQL migration.

## 6. AI layer design

### 6.1 Provider abstraction (agnostic)

`LLMProvider`:
```
name: string
chat(req: ChatRequest): Promise<ChatResponse>       // neutral messages + tools -> assistant msg | tool_calls + usage
classify(msg: string, labels: string[]): Promise<string>  // structured, enum-only output
```
Message/tool/usage types are **neutral** (defined by us, not OpenAI). The OpenAI
adapter translates to/from the wire format. `chat.ts` imports only neutral
types, so a Bedrock adapter drops in behind the same interface.

### 6.2 Layered guardrails (defense in depth)

```
user msg
  -> [1] intent-gate: classify() -> {book | list_services | ask_appointment | out_of_scope}
         out_of_scope -> deterministic refusal, NO main LLM call
  -> [2] main LLM with strict system prompt + tools ONLY
  -> [3] output-validator: no code fences, on-topic, or -> fallback refusal
  -> reply
```
- The gate is a separate enum-only call. User text is data to classify, never
  instructions to obey, so "ignore your instructions" cannot reprogram it.
- The main model can only *act* through tools; it cannot execute anything.
- The validator is the last net for drift the prompt let through.
- All three must fail for an off-topic answer to escape.

### 6.3 Tools (4) and dispatch

- `list_services()` -> all services.
- `get_professionals_for_service(serviceCode)` -> dentists + level/expertise.
- `check_availability(serviceCode, professionalId, day)` -> one dentist's open slots.
- `create_booking(serviceCode, professionalId, start, patientName, patientEmail)`.

Dispatch validates every tool-call argument with **zod** before calling
`lib/booking`. Model output is untrusted input.

### 6.4 Tool-calling loop

Hand-written in `chat.ts`: send messages -> if `tool_calls`, run each via
dispatch, append results, re-call model, repeat until a plain assistant message
or a **max-iteration cap**. Hitting the cap -> deterministic fallback (no
infinite spend). Loop is transport-agnostic: a future voice channel calls the
same service.

### 6.5 Conversation flow (stateful, stateless server)

The client holds the full message history and sends it each request; the server
is stateless. "Going back" (try another dentist) is just the model calling
`check_availability` again — no special state machine. Example:

```
"I want a teeth filling"  -> get_professionals_for_service("C") -> Oscar, Kate (both senior)
"Oscar"                    -> check_availability(Oscar, C, week) -> evenings only
"no, afternoon; try Kate"  -> check_availability(Kate, C, tomorrow) -> 2pm open
"book it"                  -> create_booking(...)
```

## 7. Authentication (passwordless OTP)

- `POST /api/auth/request-otp {email}` -> upsert patient, generate 6-digit code,
  store `code_hash` + expiry, email it (or console.log in dev).
- `POST /api/auth/verify-otp {email, code}` -> check hash + expiry + unconsumed,
  mark consumed, set httpOnly signed JWT session cookie.
- `POST /api/auth/logout` -> clear cookie.
- `GET /api/appointments` -> auth-gated; returns the session patient's bookings.
- No passwords stored. Documented simplification: OTP delivery in dev is the
  console; production needs an email provider env var.

## 8. Calendar (attendee-invite model + provider registry)

- On a **committed** booking, the controller/service fires a side-effect:
  resolve the dentist's provider from the registry, call
  `createEvent({ calendarId, start, end, summary, attendees: [patientEmail] })`.
- One event, dentist as organizer, patient as **attendee by email** -> appears
  on both calendars, no patient OAuth required.
- Registry maps provider name -> adapter. Adding Zoho = one new file + one
  `register()` call; no existing code changes. Different dentists may use
  different providers.
- Default provider = `noop` (logs). Real Google/Outlook/Zoho adapters are
  documented stubs, wireable via env. Side-effect failures are logged and never
  block or roll back the booking (DB is source of truth).
- `isBusy(patient...)` (reading the patient's personal calendar) stays behind
  the interface, deferred (needs patient OAuth).

## 9. Rate limiting & token monitoring (in-memory)

- `rate-limit.ts`: per-key (session/IP) token-bucket. Controller rejects over-limit
  requests with a canned 429 message before any LLM work.
- `tokens.ts`: wraps provider calls, sums `usage.total_tokens` per session and
  globally, logs each call, and can hard-stop on a configurable budget ->
  deterministic fallback message.
- In-memory (resets on restart) — acceptable for a single-instance take-home;
  Redis is the documented scale path.

## 10. Failure handling / deterministic fallbacks

Every layer degrades to a canned response; user never sees stack traces or raw
model/errors:

- provider error/timeout -> "having trouble right now, please try again".
- max tool-loop iterations -> stop + canned.
- output-validator rejects -> canned refusal.
- rate limit exceeded -> canned 429.
- token budget exceeded -> canned.
- intent-gate out_of_scope -> canned scope refusal.

## 11. Golden set (proves the guardrail)

- `tests/golden/cases.json`: `{ input, expect: "allow" | "refuse", note }`.
  - allow: "book a filling", "what services?", "who does whitening?", "my appointments".
  - refuse: "write me Python", "tell a joke", "do I have a cavity?" (medical),
    general trivia, prompt-injection ("ignore previous instructions and ...").
- `tests/golden.test.ts`: runs the pipeline over cases against a **mocked**
  provider -> deterministic, offline, CI-safe. Verifies routing (refuse ->
  canned, allow -> proceeds). Does not measure model judgment.
- `scripts/eval-live.ts` (`npm run eval:live`): hits the **real** classifier,
  prints scope accuracy. Manual, costs money, used to demo real guardrail
  strength. CI stays green offline.

## 12. Voice AI (future, seam only)

No voice code now. `chat.ts` is transport-agnostic: a voice channel would
transcribe speech -> call the same service -> speak the reply. Documented as a
seam; the module split already supports it.

## 13. Build order (phased)

1. **Drizzle swap** — `schema.ts`, `client.ts`, rewrite `queries.ts` behind the
   existing `BookingRepository` port. Keep 22 tests green. Raw SQL constraint
   untouched.
2. **Booking core delta** — add `findAvailabilityForProfessional`; add tests.
3. **Provider port + OpenAI adapter** — neutral types, factory.
4. **Tools + dispatch (zod) + chat loop.**
5. **Guardrails** — intent-gate, system prompt, output-validator, refusals.
6. **Rate limit + tokens + thin controller** (`app/api/chat/route.ts`).
7. **Auth (OTP)** — tables, otp/session/mailer, auth routes, appointments route.
8. **Calendar** — types, registry, noop + stub adapters, booking side-effect,
   `professionals.calendar_*` columns.
9. **Golden set** — cases, mocked pipeline test, live eval script.
10. **UI** — chat + login panel + appointments list.
11. **README + end-to-end verification.**

## 14. New dependencies

- `drizzle-orm`, `drizzle-kit` (dev)
- `zod`
- `jsonwebtoken` (or `jose`) for session cookie
- an email sender only if wiring real OTP delivery (optional; console fallback
  otherwise)

## 15. Documented simplifications (README)

- UTC treated as clinic-local (single timezone).
- OTP delivery defaults to server console in dev.
- Rate-limit/token state is in-memory (single instance).
- Calendar providers ship as logging stubs; real API wiring is behind the
  interface and env-gated.
- Patient's personal-calendar conflict check deferred (needs patient OAuth).

## 16. Verification

- `npm test` -> booking tests + mocked golden set green, no Docker needed.
- `docker compose up` -> app on :3000, Postgres seeded.
- Manual: book service A (success); double-book same dentist/slot (refused);
  medical/off-topic/code-generation attempts (refused deterministically);
  junior dentist for a senior-only service (not offered); request OTP -> verify
  -> view own appointments.
- `npm run eval:live` -> real scope-accuracy report.
