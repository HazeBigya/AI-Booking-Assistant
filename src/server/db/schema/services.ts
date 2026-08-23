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
    basePrice: integer("base_price").notNull(), // whole dollars (integer, not float)
  },
  (t) => ({
    durationPositive: check("services_duration_positive", sql`${t.durationMinutes} > 0`),
    pricePositive: check("services_price_nonneg", sql`${t.basePrice} >= 0`),
  }),
);
