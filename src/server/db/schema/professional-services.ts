import { integer, pgTable, primaryKey, smallint, text } from "drizzle-orm/pg-core";
import { professionals } from "./professionals";
import { services } from "./services";

// Which dentist can perform which service (their skill set), plus per-service
// expertise and an optional price override.
export const professionalServices = pgTable(
  "professional_services",
  {
    professionalId: integer("professional_id")
      .notNull()
      .references(() => professionals.id, { onDelete: "cascade" }),
    serviceId: integer("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    expertiseNote: text("expertise_note"),
    proficiency: smallint("proficiency"), // optional 1–5, for honest ranking
    priceOverride: integer("price_override"), // per-dentist dollars; NULL = use base
  },
  (t) => ({
    pk: primaryKey({ columns: [t.professionalId, t.serviceId] }),
  }),
);
