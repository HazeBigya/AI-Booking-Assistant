import { index, pgTable, serial, text } from "drizzle-orm/pg-core";
import { tstz } from "./helpers";

// Short-lived, single-use login codes. Stored hashed; verified then consumed.
export const otpCodes = pgTable(
  "otp_codes",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: tstz("expires_at").notNull(),
    consumedAt: tstz("consumed_at"),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => ({ emailIdx: index("idx_otp_codes_email").on(t.email) }),
);
