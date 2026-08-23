import { pgTable, serial, text } from "drizzle-orm/pg-core";
import { tstz } from "./helpers";

export const patients = pgTable("patients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  createdAt: tstz("created_at").notNull().defaultNow(),
});
