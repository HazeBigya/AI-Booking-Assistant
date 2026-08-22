// =============================================================================
// The one place a Postgres connection is created.
//
// We use a single shared Pool for the whole process. A Pool keeps a small set
// of live connections open and hands them out per query, so we don't pay the
// cost of a TCP + auth handshake on every request. `pg` is fully async; each
// query() borrows a client from the pool and returns it automatically.
//
// Nothing here knows about the booking rules — this module only speaks SQL.
// =============================================================================

import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  // Fail loud at startup rather than on the first query with a confusing error.
  throw new Error("DATABASE_URL is not set. See .env.example.");
}

export const pool = new Pool({ connectionString });
