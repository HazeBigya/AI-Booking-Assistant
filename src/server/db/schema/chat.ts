import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, serial, text, uuid } from "drizzle-orm/pg-core";
import { tstz } from "./helpers";
import { patients } from "./patients";

export const chatSessions = pgTable("chat_sessions", {
  id: uuid("id").primaryKey().defaultRandom(), // the httpOnly cookie value
  patientId: integer("patient_id").references(() => patients.id), // null until login
  createdAt: tstz("created_at").notNull().defaultNow(),
});

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: serial("id").primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // 'user' | 'assistant' | 'tool'
    content: text("content").notNull(),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => ({
    roleValid: check("chat_messages_role_valid", sql`${t.role} in ('user','assistant','tool')`),
    sessionTime: index("idx_chat_messages_session_time").on(t.sessionId, t.createdAt),
  }),
);
