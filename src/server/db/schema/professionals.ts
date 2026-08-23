import { sql } from "drizzle-orm";
import { check, pgTable, serial, text } from "drizzle-orm/pg-core";

export const professionals = pgTable(
  "professionals",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().default(""), // for calendar invites
    title: text("title").notNull(), // 'Junior Dentist' | 'Senior Dentist'
    level: text("level").notNull(), // 'junior' | 'senior' — drives capability
    bio: text("bio").notNull(),
    calendarProvider: text("calendar_provider").notNull().default("noop"),
    calendarId: text("calendar_id"),
  },
  (t) => ({
    levelValid: check("professionals_level_valid", sql`${t.level} in ('junior','senior')`),
  }),
);
