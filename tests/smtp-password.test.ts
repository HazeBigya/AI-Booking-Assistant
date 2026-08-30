import { describe, expect, it } from "vitest";
import { normalisePassword } from "@server/sdk/mailer/smtp";

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
