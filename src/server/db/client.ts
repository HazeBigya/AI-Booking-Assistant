import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// One shared Pool per process; Drizzle borrows/returns connections per query.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. See .env.example.");
}

export const pool = new Pool({ connectionString });
export const db = drizzle(pool, { schema });
