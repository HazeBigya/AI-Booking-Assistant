import { describe, expect, it } from "vitest";
import { isPlaceholderName, placeholderNameFor } from "@server/auth/patients";

// A patient row exists the moment an email is verified, which is before anyone
// has said their name. It is seeded with the local part of the address, and the
// difference between that and a real name decides two things: whether
// "bigyatuladhar" ends up on a calendar invite, and whether a returning patient
// is asked their name a second time.
describe("placeholder names", () => {
  it("seeds from the local part of the address", () => {
    expect(placeholderNameFor("bigyatuladhar@gmail.com")).toBe("bigyatuladhar");
  });

  it("recognises the seeded value as not a real name", () => {
    expect(isPlaceholderName("bigyatuladhar", "bigyatuladhar@gmail.com")).toBe(true);
  });

  it("is not fooled by case or padding", () => {
    expect(isPlaceholderName("  BigyaTuladhar ", "bigyatuladhar@gmail.com")).toBe(true);
  });

  it("treats a real name as real", () => {
    expect(isPlaceholderName("Bigya Tuladhar", "bigyatuladhar@gmail.com")).toBe(false);
  });

  // Someone whose name genuinely is their address's local part still gets asked
  // once, which is the safe direction to be wrong in: an unnecessary question
  // costs a turn, a wrong name goes on a calendar invite and an email.
  it("errs toward asking rather than guessing", () => {
    expect(isPlaceholderName("john", "john@gmail.com")).toBe(true);
  });
});
