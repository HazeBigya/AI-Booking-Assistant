import { describe, it, expect } from "vitest";
import {
  ANON_MESSAGES_PER_DAY,
  PATIENT_MESSAGES_PER_DAY,
  checkUsage,
} from "@server/domain/usage/limits";

describe("checkUsage", () => {
  it("allows an ordinary anonymous turn", () => {
    expect(checkUsage({ session: 0 }).allowed).toBe(true);
  });

  it("blocks an anonymous session at the cap", () => {
    const v = checkUsage({ session: ANON_MESSAGES_PER_DAY });
    expect(v.allowed).toBe(false);
    if (!v.allowed) expect(v.scope).toBe("session");
  });

  it("lets a verified patient go past the anonymous cap", () => {
    // The point of verifying: a real patient is not held to the limit meant for
    // someone who has proved nothing.
    expect(checkUsage({ session: ANON_MESSAGES_PER_DAY + 20, patient: 40 }).allowed).toBe(true);
  });

  it("blocks a verified patient at their own, higher cap", () => {
    const v = checkUsage({ session: 0, patient: PATIENT_MESSAGES_PER_DAY });
    expect(v.allowed).toBe(false);
    if (!v.allowed) expect(v.scope).toBe("patient");
  });

  it("never shows the patient a number or the word limit", () => {
    // A message that announces the cap tells an attacker what to work around,
    // and tells a patient they did something wrong. Neither helps.
    for (const counts of [
      { session: ANON_MESSAGES_PER_DAY },
      { session: 0, patient: PATIENT_MESSAGES_PER_DAY },
    ]) {
      const v = checkUsage(counts);
      expect(v.allowed).toBe(false);
      if (!v.allowed) {
        expect(v.message).not.toMatch(/\d/);
        expect(v.message.toLowerCase()).not.toContain("limit");
        expect(v.message).toContain("call the clinic");
      }
    }
  });

  it("gives a verified patient a higher cap than an anonymous one", () => {
    expect(ANON_MESSAGES_PER_DAY).toBeLessThan(PATIENT_MESSAGES_PER_DAY);
  });
});
