import { createHash, randomInt } from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "@server/db/client";
import { otpCodes } from "@server/db/schema";

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

const hashCode = (email: string, code: string): string =>
  createHash("sha256").update(`${email}:${code}`).digest("hex");

// Creates a 6-digit code, stores only its hash, returns the plain code to send.
export async function createOtp(email: string): Promise<string> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.insert(otpCodes).values({
    email,
    codeHash: hashCode(email, code),
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
  });
  return code;
}

// True only for a matching, unexpired, unconsumed code — then consumes it.
export async function verifyOtp(email: string, code: string): Promise<boolean> {
  const rows = await db
    .select({ id: otpCodes.id })
    .from(otpCodes)
    .where(
      and(
        eq(otpCodes.email, email),
        eq(otpCodes.codeHash, hashCode(email, code)),
        isNull(otpCodes.consumedAt),
        gt(otpCodes.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(otpCodes.id))
    .limit(1);

  const row = rows[0];
  if (!row) return false;
  await db.update(otpCodes).set({ consumedAt: new Date() }).where(eq(otpCodes.id, row.id));
  return true;
}
