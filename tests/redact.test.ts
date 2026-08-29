import { describe, expect, it } from "vitest";
import { redactToolPayload } from "@server/sdk/ai/chat";

describe("redactToolPayload", () => {
  // The whole point: otp.ts hashes the code at rest and never stores it in
  // plaintext. Printing it to the log would defeat that.
  it("masks a login code", () => {
    const out = redactToolPayload('{"email":"pat@example.com","code":"481920"}');
    expect(out).not.toContain("481920");
    expect(out).toContain("[redacted]");
  });

  it("masks patient identity", () => {
    const out = redactToolPayload('{"patientName":"Pat Jones","patientEmail":"pat@example.com"}');
    expect(out).not.toContain("Pat Jones");
    expect(out).not.toContain("pat@example.com");
  });

  // Redaction is worthless if it hides what you actually need to debug.
  it("keeps the non-sensitive arguments readable", () => {
    const out = redactToolPayload('{"serviceName":"Cleaning","dentistName":"Kate","code":"1"}');
    expect(out).toContain("Cleaning");
    expect(out).toContain("Kate");
    expect(out).not.toContain('"1"');
  });

  it("redacts sensitive keys nested inside objects and arrays", () => {
    const out = redactToolPayload('{"rows":[{"patientEmail":"a@b.test"}]}');
    expect(out).not.toContain("a@b.test");
  });

  it("is case-insensitive about key names", () => {
    expect(redactToolPayload('{"Email":"a@b.test"}')).not.toContain("a@b.test");
  });

  // A tool result is not always JSON, and a logger must never throw.
  it("returns non-JSON payloads unchanged rather than failing", () => {
    expect(redactToolPayload("not json at all")).toBe("not json at all");
  });

  it("caps a very long payload so one call cannot flood the log", () => {
    const long = JSON.stringify({ note: "x".repeat(5000) });
    expect(redactToolPayload(long).length).toBeLessThan(1200);
  });
});
