import { describe, it, expect } from "vitest";
import { validateOutput } from "@server/sdk/ai/guardrails";

describe("validateOutput", () => {
  it("passes a normal reply through unchanged", () => {
    const reply = "Here are our services: Routine Checkup, Teeth Whitening…";
    expect(validateOutput(reply)).toBe(reply);
  });

  it("blocks a reply containing code fences", () => {
    const out = validateOutput("Sure:\n```python\nprint('hi')\n```");
    expect(out).not.toContain("```");
    // The refusal names what the clinic does instead of what it is, since the
    // field is seed data rather than something the code knows.
    expect(out.toLowerCase()).toContain("appointments");
  });

  it("strips emojis and tidies the whitespace they leave", () => {
    expect(validateOutput("Your appointment is booked! 😊")).toBe("Your appointment is booked!");
    expect(validateOutput("Great 👍 — see you then")).toBe("Great — see you then");
  });
});

// A patient in the clinic's own zone gets no "yourLocalTime" field in any tool
// result — the data is absent, so a sentence about their local time is not a
// bad conversion but an invented one, and it always cancels out to the same
// clock time twice. Three rewordings survived three prompt rules; whether there
// is a second zone is something the server knows for certain, so the model
// stops being asked and the clause is simply removed.
describe("inventing the patient's local time", () => {
  const same = { sameTimeZone: true };

  it("removes an appended clause", () => {
    expect(
      validateOutput("Booked for 9:00 AM, and that's also 9:00 AM your local time.", same),
    ).toBe("Booked for 9:00 AM.");
  });

  it("removes a whole sentence given over to it", () => {
    expect(
      validateOutput("Kate is free from 9:00 AM. These times are also your local time.", same),
    ).toBe("Kate is free from 9:00 AM.");
  });

  it("removes the range wording that got past the last rule", () => {
    expect(
      validateOutput(
        "Booked with Kate from 9:00 AM to 10:00 AM. It's also 9:00 AM to 10:00 AM your local time.",
        same,
      ),
    ).toBe("Booked with Kate from 9:00 AM to 10:00 AM.");
  });

  it("leaves the rest of the reply untouched", () => {
    const reply = "Kate does whitening for $150. Shall I book you in?";
    expect(validateOutput(reply, same)).toBe(reply);
  });

  // A patient genuinely in another zone HAS a second time, and the tool result
  // carries it. Stripping it there would delete real information.
  it("keeps it when the patient is somewhere else", () => {
    const reply = "Booked for 9:00 AM, and that's also 11:45 AM your local time.";
    expect(validateOutput(reply, { sameTimeZone: false })).toBe(reply);
  });
});
