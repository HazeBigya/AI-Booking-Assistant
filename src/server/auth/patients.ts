import { eq } from "drizzle-orm";
import { db } from "@server/db/client";
import { patients } from "@server/db/schema";

// The row is created the instant an email is verified, which is before anyone
// has said their name — so it starts as the local part of the address. That is
// a placeholder, not a name, and the difference matters twice: "bigyatuladhar"
// must never reach a calendar invite, and a patient who HAS given their real
// name must never be asked for it again.
export function placeholderNameFor(email: string): string {
  return email.split("@")[0];
}

export function isPlaceholderName(name: string, email: string): boolean {
  return name.trim().toLowerCase() === placeholderNameFor(email).trim().toLowerCase();
}

export async function findOrCreatePatient(email: string, fallbackName: string) {
  const existing = await db.select().from(patients).where(eq(patients.email, email)).limit(1);
  if (existing[0]) return existing[0];
  const inserted = await db.insert(patients).values({ email, name: fallbackName }).returning();
  return inserted[0];
}

// The real name, or undefined while only the placeholder is on file.
export async function knownPatientName(email: string): Promise<string | undefined> {
  const row = await db.select().from(patients).where(eq(patients.email, email)).limit(1);
  const name = row[0]?.name?.trim();
  if (!name || isPlaceholderName(name, email)) return undefined;
  return name;
}

// Called once the patient gives a real name, so the next booking does not ask.
export async function setPatientName(email: string, name: string): Promise<void> {
  await db.update(patients).set({ name: name.trim() }).where(eq(patients.email, email));
}

// Cheap existence check. The session token is self-contained and stays valid
// for 7 days, so it can outlive the row it refers to — after `npm run destroy`,
// or a restore from an older backup. Without this the app would show someone as
// logged in as a patient the clinic no longer has.
export async function patientExists(email: string): Promise<boolean> {
  const rows = await db
    .select({ id: patients.id })
    .from(patients)
    .where(eq(patients.email, email))
    .limit(1);
  return rows.length > 0;
}
