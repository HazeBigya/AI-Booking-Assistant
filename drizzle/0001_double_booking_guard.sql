-- Double-booking guard. Drizzle's schema DSL can't express an exclusion
-- constraint, so it lives here as reviewed custom SQL.

-- btree_gist lets one GiST index mix scalar equality (professional_id) with a
-- range-overlap check in the same EXCLUDE constraint.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Reject any new booking whose [start,end) range overlaps (&&) an existing one
-- for the same professional. '[)' makes touching bookings (10-11, 11-12) legal.
-- Partial (WHERE status = 'booked') so cancelled rows free their slot but stay
-- for audit. Holds under concurrent inserts; correctness lives here.
ALTER TABLE "bookings"
  ADD CONSTRAINT "no_double_booking"
  EXCLUDE USING gist (
    professional_id WITH =,
    tstzrange(start_time, end_time, '[)') WITH &&
  ) WHERE (status = 'booked');
