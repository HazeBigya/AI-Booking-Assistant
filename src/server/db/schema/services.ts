import { sql } from "drizzle-orm";
import { check, integer, pgTable, serial, text } from "drizzle-orm/pg-core";

export const services = pgTable(
  "services",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    basePriceCents: integer("base_price_cents").notNull(),
  },
  (t) => ({
    durationPositive: check("services_duration_positive", sql`${t.durationMinutes} > 0`),
    pricePositive: check("services_price_nonneg", sql`${t.basePriceCents} >= 0`),
  }),
);
