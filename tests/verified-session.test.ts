import { describe, it, expect } from "vitest";
import { createSessionToken } from "@server/auth/session";
import { verifySession } from "@server/auth/verified-session";

const known = async () => true;
const wiped = async () => false;

describe("verifySession", () => {
  it("accepts a signed token when the patient still exists", async () => {
    const token = await createSessionToken({ email: "a@b.com", name: "A" });
    expect(await verifySession(token, known)).toEqual({ email: "a@b.com", name: "A" });
  });

  it("refuses a signed token when the patient is gone", async () => {
    // This is `npm run destroy`, or a restore from an older backup: the token is
    // ours and unexpired, but the row it names no longer exists.
    const token = await createSessionToken({ email: "a@b.com", name: "A" });
    expect(await verifySession(token, wiped)).toBeNull();
  });

  it("refuses a missing token without asking the database", async () => {
    let asked = false;
    const spy = async () => {
      asked = true;
      return true;
    };
    expect(await verifySession(undefined, spy)).toBeNull();
    expect(asked).toBe(false);
  });

  it("refuses a tampered token without asking the database", async () => {
    let asked = false;
    const spy = async () => {
      asked = true;
      return true;
    };
    const token = (await createSessionToken({ email: "a@b.com", name: "A" })) + "x";
    expect(await verifySession(token, spy)).toBeNull();
    // The signature is checked first, so a forged token never reaches a query.
    expect(asked).toBe(false);
  });
});
