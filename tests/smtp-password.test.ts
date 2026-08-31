import { describe, expect, it } from "vitest";
import { addressOf, normalisePassword, warnIfFromIsUnauthorised } from "@server/sdk/mailer/smtp";

// Google displays an app password as four groups of four, so that is how it
// gets copied into .env. The spaces are presentation and authenticate as a
// different string; the resulting 535 reads as a wrong password rather than a
// formatting detail, which is a bad half-hour for whoever hits it.
describe("normalisePassword", () => {
  it("strips the spaces Google puts in an app password", () => {
    expect(normalisePassword("abcd efgh ijkl mnop")).toBe("abcdefghijklmnop");
  });

  it("leaves an already-joined app password alone", () => {
    expect(normalisePassword("abcdefghijklmnop")).toBe("abcdefghijklmnop");
  });

  // Only that exact shape is touched. Some SMTP hosts allow spaces in a
  // password, and quietly removing one would lock the account out instead.
  it("does not touch a password that merely contains spaces", () => {
    expect(normalisePassword("correct horse battery staple")).toBe("correct horse battery staple");
    expect(normalisePassword("abcd efgh")).toBe("abcd efgh");
    expect(normalisePassword("ab cd ef gh")).toBe("ab cd ef gh");
  });
});

// The setting that looks like it works and does nothing. Gmail rewrites an
// unauthorised From back to the account that authenticated, so mail arrives
// from the developer's own address with no error anywhere to explain it.
describe("warnIfFromIsUnauthorised", () => {
  it("says nothing when the From is the authenticated account", () => {
    expect(
      warnIfFromIsUnauthorised("Bright Smile Clinic <me@gmail.com>", "me@gmail.com"),
    ).toBeUndefined();
  });

  it("accepts a bare address with no display name", () => {
    expect(warnIfFromIsUnauthorised("me@gmail.com", "me@gmail.com")).toBeUndefined();
  });

  // An address is not case sensitive, and a warning about ME@ versus me@ would
  // train the reader to ignore the real one.
  it("does not care about case", () => {
    expect(warnIfFromIsUnauthorised("Clinic <ME@Gmail.com>", "me@gmail.com")).toBeUndefined();
  });

  it("names both variables and the fix when they disagree", () => {
    const warning = warnIfFromIsUnauthorised(
      "Bright Smile Clinic <no-reply.brightsmile@gmail.com>",
      "bigya.developer@gmail.com",
    );
    expect(warning).toContain("no-reply.brightsmile@gmail.com");
    expect(warning).toContain("bigya.developer@gmail.com");
    expect(warning).toContain("verified alias");
  });
});

describe("addressOf", () => {
  it("pulls the address out of a display-name form", () => {
    expect(addressOf("Bright Smile Clinic <a@b.com>")).toBe("a@b.com");
  });

  it("returns a bare address unchanged", () => {
    expect(addressOf("  A@B.com ")).toBe("a@b.com");
  });
});
