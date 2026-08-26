import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Lazy, so the module stays side-effect-free and `next build` can load route
// files to collect page data without a live DATABASE_URL.
let poolInstance: Pool | undefined;
let dbInstance: NodePgDatabase<typeof schema> | undefined;

function init(): NodePgDatabase<typeof schema> {
  if (!dbInstance) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set. See .env.example.");
    }
    poolInstance = new Pool({ connectionString });
    dbInstance = drizzle(poolInstance, { schema });
  }
  return dbInstance;
}

export const db = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_target, prop) {
    return Reflect.get(init() as object, prop);
  },
});

export const pool = new Proxy({} as Pool, {
  get(_target, prop) {
    init();
    return Reflect.get(poolInstance as object, prop);
  },
});
