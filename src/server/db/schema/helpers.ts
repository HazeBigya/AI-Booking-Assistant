import { timestamp } from "drizzle-orm/pg-core";

// UTC timestamp returned/accepted as a JS Date (not a string).
export const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
