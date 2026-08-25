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
    expect(out.toLowerCase()).toContain("dental");
  });

  it("strips emojis and tidies the whitespace they leave", () => {
    expect(validateOutput("Your appointment is booked! 😊")).toBe("Your appointment is booked!");
    expect(validateOutput("Great 👍 — see you then")).toBe("Great — see you then");
  });
});
