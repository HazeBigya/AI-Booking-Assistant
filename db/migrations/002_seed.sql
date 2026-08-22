-- =============================================================================
-- Seed data. Runs after 001_schema.sql on first boot.
-- =============================================================================

-- 5 services. Durations per the assignment:
--   A = 1h, B = 1h, C = 2.5h, D = 2h, E = 6h
INSERT INTO services (code, name, duration_minutes) VALUES
  ('A', 'Routine Checkup',        60),
  ('B', 'Teeth Cleaning',         60),
  ('C', 'Cavity Filling',        150),
  ('D', 'Root Canal',            120),
  ('E', 'Full Mouth Restoration', 360);

-- 3 professionals: 1 junior, 2 senior.
INSERT INTO professionals (name, level) VALUES
  ('Dr. Alice Junior', 'junior'),
  ('Dr. Bob Senior',   'senior'),
  ('Dr. Carol Senior', 'senior');

-- Capability rule as DATA:
--   junior -> A, B only
--   senior -> A, B, C, D, E
-- Written as set-based INSERT...SELECT so it stays correct even if ids shift.
INSERT INTO professional_services (professional_id, service_id)
SELECT p.id, s.id
FROM professionals p
JOIN services s
  ON (
    p.level = 'senior'                       -- seniors: every service
    OR (p.level = 'junior' AND s.code IN ('A', 'B'))  -- juniors: A and B
  );
