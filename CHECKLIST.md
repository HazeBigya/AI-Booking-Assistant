# Build Checklist

Tracks what is done and what remains. Each remaining item lists the files to
create and what the interviewer should hear you explain.

## ✅ Done

### 1. Scaffold + Docker + DB (verified)
- `package.json`, `tsconfig.json`, `next.config.js`, `postcss.config.js`,
  `tailwind.config.ts`, `vitest.config.ts`
- `Dockerfile` (multi-stage), `docker-compose.yml`, `.dockerignore`,
  `.env.example`, `.gitignore`
- `db/migrations/001_schema.sql` — tables + `EXCLUDE USING gist` no-double-book guard
- `db/migrations/002_seed.sql` — 3 professionals, 5 services, capability rule as data
- **Verified:** seed correct; overlap insert rejected; back-to-back insert allowed.

### 2. Booking pure core + tests (verified, 22 tests pass)
- `lib/booking/rules.ts` — clinic hours, working days, grid, capability policy
- `lib/booking/availability.ts` — `overlaps`, `computeAvailableSlots` (pure)
- `lib/booking/ports.ts` — `BookingRepository` interface (dependency inversion)
- `lib/booking/scheduler.ts` — `findAvailability`, `createBooking` (validate → check → insert)
- `tests/booking.test.ts` — overlap, rules, availability, scheduler (fake repo)

## ⬜ Remaining

### 3. DB + calendar layers ✅ (typecheck clean, 22 tests still green)
- [x] `lib/db/client.ts` — `pg` Pool from `DATABASE_URL`
- [x] `lib/db/queries.ts` — implements `BookingRepository`; maps the exclusion-
      constraint error (`code === '23P01'`) to `DoubleBookingError`
- [x] `lib/calendar/types.ts` — `CalendarProvider` interface (`isBusy`, `createEvent`) + `noopCalendar`
- [x] `lib/calendar/google.ts`, `lib/calendar/outlook.ts` — documented stubs
- **Explain:** why the DB layer *implements* an interface the booking core owns;
  the calendar seam (swap providers without touching booking logic).

### 4. AI layer + tool-calling loop (the OpenAI-only zone)
- [ ] `lib/ai/openai-client.ts` — SDK client from env
- [ ] `lib/ai/tools.ts` — function schemas (`list_services`, `check_availability`,
      `create_booking`) + dispatch map into `lib/booking`
- [ ] `lib/ai/chat.ts` — hand-written tool-calling loop + system prompt (guardrails)
- **Explain:** how function calling works; why the loop re-calls the model with
  tool results; why the model never decides availability itself.

### 5. API route + chat UI
- [ ] `app/api/chat/route.ts` — POST, runs the tool loop, stateless
- [ ] `app/layout.tsx`, `app/globals.css`, `app/page.tsx`
- [ ] `components/ChatWindow.tsx`, `components/Message.tsx`, `components/ChatInput.tsx`
- **Explain:** stateless server (client holds history); where the AI boundary sits.

### 6. README + final verification
- [ ] `README.md` — setup, architecture, the `/lib/booking` ↔ `/lib/ai` boundary,
      timezone simplification, how to reset the DB
- [ ] End-to-end: `docker compose up` → book A (success), double-book (refused),
      medical question (redirected), junior for C (not offered)

## Optional (only if time)
- [ ] Host on Railway/Render + one-shot migration, share live URL (for a
      non-technical recipient). Parked.
