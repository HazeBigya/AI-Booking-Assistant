import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, serial, text } from "drizzle-orm/pg-core";
import { tstz } from "./helpers";
import { patients } from "./patients";
import { professionals } from "./professionals";
import { services } from "./services";

// The btree_gist EXCLUDE double-booking guard is added by a custom migration
// (drizzle/0001) — Drizzle's DSL can't express an exclusion constraint.
export const bookings = pgTable(
  "bookings",
  {
    id: serial("id").primaryKey(),
    // Nullable until the booking flow (which creates patients) is wired.
    patientId: integer("patient_id").references(() => patients.id),
    professionalId: integer("professional_id")
      .notNull()
      .references(() => professionals.id),
    serviceId: integer("service_id")
      .notNull()
      .references(() => services.id),
    startTime: tstz("start_time").notNull(),
    endTime: tstz("end_time").notNull(),
    status: text("status").notNull().default("booked"), // 'booked' | 'cancelled'
    priceCents: integer("price_cents"), // snapshot at booking time (nullable for now)
    patientName: text("patient_name").notNull(),
    patientEmail: text("patient_email").notNull(),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => ({
    endAfterStart: check("bookings_end_after_start", sql`${t.endTime} > ${t.startTime}`),
    statusValid: check("bookings_status_valid", sql`${t.status} in ('booked','cancelled')`),
    profStart: index("idx_bookings_prof_start").on(t.professionalId, t.startTime),
  }),
);
