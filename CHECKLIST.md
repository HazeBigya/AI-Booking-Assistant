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
- [ ] **Chat persistence** — write `chat_sessions`/`chat_messages` (tables exist,
      unused); mint a uuid cookie, save each turn, load last ~15 for context.
      *Fixes: chat disappears on refresh.*
- [ ] **Token usage persistence** — store `totalTokens` per chat turn (on
      `chat_messages`, or a running total on `chat_sessions`) for cost monitoring
      (add a `tokens` column when wiring persistence).
- [ ] **OTP rate-limiting** — cap `request_login_code`/`verify_login_code` per email
      (brute-force + spam protection); security hole today
- [ ] **Price snapshot** — write `bookings.price` at booking time (currently null);
      then tighten `patient_id`/`price` to NOT NULL via a migration
- [ ] **Gemini model id** — verify correct id so it stops 404-ing (fallback masks it)

### Quality pass
- [ ] Consistency/SoC/dead-code sweep across all files (read like one author)
- [ ] Remove or wire the unused intent-gate + any leftover exports
- [ ] **README** — accurate setup, architecture, design decisions, security notes,
      documented simplifications (must match what's actually built)

### UI bettering
- [ ] Polish chat UX — message spacing, timestamps, loading/typing states,
      error surfacing, mobile layout, empty/edge states
- [ ] Optional: slot/dentist quick-select affordances (kept LLM-first)

### Voice AI
- [ ] Documented seam only, unless time allows: STT (browser Web Speech / Whisper)
      in front of `chat()`, TTS (SpeechSynthesis) behind it — no core change

### Testing + optimization (last)
- [ ] Broaden tests: tool dispatch (zod validation), guardrails, auth/OTP logic,
      a golden-set eval (mocked provider, CI-safe)
- [ ] Optimization: token budget cap per session, prompt trimming, query/index
      review, streaming responses, caching where it helps

### Optional / parked
- [ ] Hosting for a live URL (Vercel app + Neon Postgres — auto-resumes, no pause)
- [ ] Real per-dentist calendar API auto-accept (OAuth) — beyond the `.ics` invite
