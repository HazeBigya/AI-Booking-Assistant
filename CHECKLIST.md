# Build Checklist

Tracks what's done and what remains. Deadline: Sept 4.

## ✅ Done

### Foundation
- [x] Next.js + TS + Tailwind scaffold; multi-stage `Dockerfile`; `docker-compose`
      (db + one-shot `migrate` service + app); `.env.example`, `.gitignore`
- [x] Postgres via Drizzle: `schema/` (one file per table + barrel), `queries/`
      (per-entity + repository), tracked migrations `0000`–`0003`, idempotent seed
- [x] Double-booking guard: `EXCLUDE USING gist` partial constraint (custom migration)

### Booking core (pure, tested)
- [x] `domain/booking/` — rules, availability (`overlaps`, `computeAvailableSlots`),
      ports (dependency inversion), scheduler (`findAvailability`,
      `findAvailabilityForProfessional`, `createBooking`, `listServices`)
- [x] Dentist double-booking prevention (app check + DB constraint)
- [x] Patient double-booking prevention (can't be in two overlapping slots)
- [x] Grounded booking confirmation (returns resolved dentist + service)
- [x] `tests/booking.test.ts` — 28 unit tests (no DB needed)

### AI layer (provider-agnostic)
- [x] Neutral `LLMProvider` seam; 4 providers — OpenAI, DeepSeek, Gemini (shared
      OpenAI wire format), Bedrock (Converse) — + `LLM_FALLBACK` composition
- [x] 7 tools + zod-validated dispatch; hand-written tool-calling loop (max-iter cap)
- [x] Grounding + anti-jailbreak: strict system prompt, output validator,
      tools-only actions (optional intent-gate kept as documented layer)
- [x] Rate limiting (in-memory) on the chat endpoint; token totals returned

### Auth + email
- [x] Inline email-OTP (verified in-chat via deterministic `verify_login_code`
      tool — AI never judges the code); JWT httpOnly session
- [x] Booking gated to verified session; appointment lookup gated to session (no IDOR)
- [x] Mailer seam: console / SMTP (Gmail/Brevo) / Resend
- [x] `.ics` calendar invites emailed to patient + dentist on booking (no OAuth)

### Frontend
- [x] Generic HTTP fetcher (one place); resource API modules; components never fetch
- [x] Chat UI: markdown rendering (tables/bold), autofocus, login status in header

## ⬜ Remaining (in priority order)

### Core gaps
- [x] **Chat persistence** — server-authoritative: `chat_session` uuid cookie,
      each turn saved to `chat_messages`, last 15 loaded for context, history
      restored on refresh via GET /api/chat/history.
- [x] **Token usage persistence** — `chat_messages.tokens` stores per-turn
      totalTokens on the assistant message (migration 0004).
- [x] **OTP rate-limiting** — per-email caps (3 requests / 5 verifies per 10 min)
      on `request_login_code`/`verify_login_code` (brute-force + spam protection)
- [x] **One-command setup** — `npm run setup` (wipe + boot + migrate + seed);
      `docker compose up` runs the full app + auto migrate/seed for the interviewer
- [x] **Price + patient snapshot** — `bookings.price` (per-dentist override/base)
      and `bookings.patient_id` are now written at booking time, resolved from
      authoritative tables in the persistence layer. (NOT NULL tightening: parked.)
- [x] **Past-time guard** — deterministic: `check_availability` filters past
      slots, `create_booking` rejects a past start; regression-locked by tests.
- [x] **Session ↔ patient link** — `chat_sessions.patient_id` set on email verify.

### Quality pass
- [x] Remove the unused intent-gate (`isInScope`, `INTENT_LABELS`, `REFUSAL_MESSAGE`);
      `classify` kept as a tested provider-seam capability, off the hot path
- [x] **README** — rewritten to match what's actually built (auth, persistence,
      invites, fallback chain, past-time guard, 49 tests)
- [ ] Optional: consistency/SoC final read-through

### UI bettering
- [ ] Polish chat UX — message spacing, timestamps, loading/typing states,
      error surfacing, mobile layout, empty/edge states
- [ ] Optional: slot/dentist quick-select affordances (kept LLM-first)

### Voice AI
- [ ] Documented seam only, unless time allows: STT (browser Web Speech / Whisper)
      in front of `chat()`, TTS (SpeechSynthesis) behind it — no core change

### Testing + optimization (last)
- [x] Tests for recent logic: `.ics` builder, fallback chain, rate limiter,
      output validator, **tool-dispatch guards** (auth-gate, past-time, IDOR,
      bad input) — **49 tests total**. `npm run setup` runs the suite at the end.
- [ ] Still to broaden (post-MVP): auth/OTP unit tests, a golden-set eval
      (mocked provider, CI-safe)
- [ ] Optimization: token budget cap per session, prompt trimming, query/index
      review, streaming responses, caching where it helps

### Optional / parked
- [ ] Hosting for a live URL (Vercel app + Neon Postgres — auto-resumes, no pause)
- [ ] Real per-dentist calendar API auto-accept (OAuth) — beyond the `.ics` invite
