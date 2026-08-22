-- =============================================================================
-- Schema for the dental clinic booking system.
-- Runs automatically on first boot via /docker-entrypoint-initdb.d.
-- =============================================================================

-- btree_gist lets a GiST index mix a scalar equality column (professional_id)
-- with a range-overlap column in the SAME exclusion constraint. Without it,
-- the EXCLUDE below cannot be created. See the bookings table.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Professionals: 1 junior, 2 senior (seeded in 002).
-- A CHECK constraint keeps "level" to two values without the ceremony of a
-- Postgres ENUM type (which is harder to alter later).
CREATE TABLE professionals (
  id    SERIAL PRIMARY KEY,
  name  TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('junior', 'senior'))
);

-- Services A-E. `code` is the human-facing letter; duration drives scheduling.
CREATE TABLE services (
  id               SERIAL PRIMARY KEY,
  code             TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0)
);

-- Join table: which professional is allowed to perform which service.
-- This is the SOURCE OF TRUTH for capability. The business rule
-- (junior: A,B / senior: A-E) is enforced here in data via the seed, so
-- availability queries can just JOIN instead of hard-coding the rule.
CREATE TABLE professional_services (
  professional_id INTEGER NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  service_id      INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  PRIMARY KEY (professional_id, service_id)
);

-- Bookings. start/end stored as timestamptz (UTC in the DB).
CREATE TABLE bookings (
  id              SERIAL PRIMARY KEY,
  professional_id INTEGER NOT NULL REFERENCES professionals(id),
  service_id      INTEGER NOT NULL REFERENCES services(id),
  start_time      TIMESTAMPTZ NOT NULL,
  end_time        TIMESTAMPTZ NOT NULL,
  patient_name    TEXT NOT NULL,
  patient_email   TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (end_time > start_time),

  -- THE double-booking guard, enforced by the database itself.
  -- Reject any new row whose [start_time, end_time) range OVERLAPS (&&) an
  -- existing row FOR THE SAME professional (professional_id WITH =).
  -- '[)' = start inclusive, end exclusive: a 10:00-11:00 booking and an
  -- 11:00-12:00 booking touch but do NOT overlap, which is what we want.
  -- This holds even under a race between two concurrent inserts — the app
  -- also checks first (for a friendly message), but correctness lives here.
  CONSTRAINT no_double_booking
    EXCLUDE USING gist (
      professional_id WITH =,
      tstzrange(start_time, end_time, '[)') WITH &&
    )
);

-- Fast lookups of a professional's bookings on a given day.
CREATE INDEX idx_bookings_prof_start ON bookings (professional_id, start_time);
