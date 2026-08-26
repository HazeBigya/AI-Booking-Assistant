# Build Checklist

Tracks what's done and what remains. Code due **Sept 4**, demo **Sept 7**.

## ✅ Done

### Foundation
- [x] Next.js + TS + Tailwind scaffold; multi-stage `Dockerfile`; `docker-compose`
      (db + one-shot `migrate` service + app); `.env.example`, `.gitignore`
- [x] Postgres via Drizzle: `schema/` (one file per table + barrel), `queries/`
      (per-entity + repository), tracked migrations, idempotent seed
- [x] Double-booking guard: `EXCLUDE USING gist` partial constraint (custom migration)
- [x] **One command runs everything** — `npm run start:all` launches Docker Desktop,
      Postgres, migrate + seed, and the app; `SETUP.md` written for a non-developer

### Booking core (pure, tested)
- [x] `domain/booking/` — rules, availability (`overlaps`, `computeAvailableSlots`),
      ports (dependency inversion), scheduler, timezone
- [x] Dentist double-booking prevention (app check + DB constraint)
- [x] Patient double-booking prevention (can't be in two overlapping slots)
- [x] Grounded booking confirmation (returns resolved dentist + service)
- [x] **Clinic timezone** — `CLINIC_TIMEZONE` (IANA). Hours, slot grid and every
      patient-facing label evaluated on the clinic clock via `Intl`; DST handled by
      the tz database. Instants stay UTC end to end.
- [x] **Past-time guard** — grid drops slots already started; `create_booking`
      rejects a past start at both the tool boundary and in the scheduler
- [x] **Empty-slot reasons** — `closed` / `too_late_today` / `fully_booked`, so a
      6-hour service late in the day says "book tomorrow" instead of going quiet

### AI layer (provider-agnostic)
- [x] Neutral `LLMProvider` seam; 5 providers — OpenAI, DeepSeek, Gemini, Bedrock
      (Converse), OpenRouter — with a priority fallback chain (`LLM_PROVIDERS`)
- [x] 8 tools + zod-validated dispatch; hand-written tool-calling loop (max-iter cap)
- [x] **Name-based entity resolution** — the model passes dentist/service NAMES;
      code resolves them and rejects unknowns. Killed the wrong-dentist bookings
      caused by the model swapping numeric ids.
- [x] **Fabricated-confirmation guard** — tool outcomes are recorded in context and
      the final reply is checked against them; an invented booking/cancellation
      gets one corrective retry, then is replaced. The model cannot announce a
      booking it never made.
- [x] **Prompt refactor** — 24 competing rules → 16, each relocated to where it
      fires (tool description / tool result / code). Nothing dropped; audited.
- [x] Grounding + anti-jailbreak: strict system prompt, output validator
      (incl. deterministic emoji stripping), tools-only actions
- [x] Rate limiting (in-memory) on the chat endpoint; token totals persisted

### Auth + email
- [x] Inline email-OTP (verified in-chat via deterministic `verify_login_code`
      tool — AI never judges the code); JWT httpOnly session
- [x] Booking gated to verified session; appointment lookup gated to session (no IDOR)
- [x] Tools enforce auth, not the model — already-logged-in short-circuits the
      OTP flow so the model cannot re-ask for an email it already has
- [x] Mailer seam: console / SMTP (Gmail/Brevo) / Resend
- [x] `.ics` calendar invites on booking, and `METHOD:CANCEL` retraction on cancel

### Booking management
- [x] **Cancel appointment** — soft cancel (`status='cancelled'`) frees the slot via
      the partial constraint and keeps history; ownership enforced in SQL
- [x] Price + patient snapshot written at booking time (`bookings.price`,
      `bookings.patient_id`), resolved from authoritative tables
- [x] Session ↔ patient link (`chat_sessions.patient_id`) set on email verify

### Chat persistence
- [x] Server-authoritative history: `chat_session` uuid cookie, each turn saved,
      last 15 loaded for context, restored on refresh
- [x] Per-turn token usage stored on the assistant message
- [x] **New conversation** button — escape hatch when persisted history poisons
      the flow (clears server history, keeps the login session)

### Frontend
- [x] Generic HTTP fetcher; resource API modules; components never fetch
- [x] Chat UI: markdown rendering, autofocus, login status in header

### Tests
- [x] **67 tests** — booking core, clinic-timezone conversion, tool-dispatch guards
      (auth gate, past time, IDOR, bad input), fabricated-confirmation guard,
      `.ics` builder, fallback chain, rate limiter, output validator. No DB needed.

---

## ⬜ Remaining

### Today — finalize text chat
- [ ] **UI glow-up** — message spacing, timestamps, better typing/loading state,
      error surfacing, mobile layout, empty state, header polish
- [ ] Delete the leftover `scripts/setup.sh` + `npm run setup` (destructive, no
      server, undocumented — a non-dev who guesses "setup" wipes their data)
- [ ] Re-test the two regression-prone flows after the prompt refactor:
      dentist substitution (ask for John, Kate free) and a 6-hour service late in
      the day
- [ ] Consistency / separation-of-concerns read-through

### Interviewer requirements (from Alessandro, Aug 26)
- [x] **Bring your own AI** — `AI_PROVIDER` + `AI_API_KEY` (+ optional `AI_MODEL`).
      Uncomment one block in `.env`, paste a key, done. OpenAI-compatible vendor
      registry (OpenAI, Anthropic, DeepSeek, Gemini, OpenRouter) so a new vendor is
      a table row, plus `custom` + `CUSTOM_BASE_URL` for anything else (Qwen, Kimi,
      Groq, local Ollama). `LLM_PROVIDERS` still available for failover chains.
      Misconfiguration now names the missing variable and lists valid providers.
- [x] Key documentation for every provider in `SETUP.md`, with the tool-calling
      requirement called out (a model without tools books nothing)
- [ ] State the provider-choice design decision: `.env` config, not an in-app key
      form — with the credential-storage reasoning, listed as a delta
- [ ] Optional: `npm run check:providers` conformance script — one real tool call
      per configured provider, so "does this model actually work" is measurable
- [ ] **Deltas section** — explicitly requested: what is not implemented and why
      (voice tier 3, calendar OAuth, provider settings UI, patient timezones,
      Redis rate limiting, NOT NULL tightening)

### Tomorrow — voice AI
- [ ] Conversational, not mechanical (Alessandro pointed at ElevenLabs' agent).
      Target tier 2: VAD auto-endpointing, streamed response, streamed natural TTS,
      behind a `VoiceProvider` seam. Tier 3 (full duplex barge-in) documented as delta.
- [ ] Latency work is load-bearing here: the loop makes ~2 model calls per turn,
      which is too slow to feel conversational without streaming

### Two documents
- [ ] **Internal** — architecture, cost of build + maintenance, safety/guardrails
- [ ] **External** — product description for the clinic, install guide

### Post-MVP / parked
- [ ] Broaden tests: auth/OTP unit tests, golden-set eval (mocked provider, CI-safe)
- [ ] Optimization: token budget cap per session, query/index review, streaming
- [ ] `NOT NULL` tightening for `patient_id` / `price`
- [ ] Hosting for a live URL (Vercel + Neon)
- [ ] Real per-dentist calendar API auto-accept (OAuth), beyond the `.ics` invite
