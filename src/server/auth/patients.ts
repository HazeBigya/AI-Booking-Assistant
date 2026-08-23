import { eq } from "drizzle-orm";
import { db } from "@server/db/client";
import { patients } from "@server/db/schema";

export async function findOrCreatePatient(email: string, fallbackName: string) {
  const existing = await db.select().from(patients).where(eq(patients.email, email)).limit(1);
  if (existing[0]) return existing[0];
  const inserted = await db.insert(patients).values({ email, name: fallbackName }).returning();
  return inserted[0];
}
