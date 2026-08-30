import { describe, expect, it } from "vitest";
import { classifyFailure, describeFailure } from "@server/sdk/ai/providers/failure";

const rejection = (status: number, message: string) =>
  Object.assign(new Error(String(status)), { status, error: { message } });

// The point of the split: a mistyped model name and a rate limit both stop the
// chat, but only one of them improves by waiting, and telling an operator to
// "try again in a moment" for the first sends them round a loop that can never
// end. This is the first thing anyone bringing their own model will hit.
describe("classifyFailure", () => {
  it("treats a rejected request as configuration, not bad luck", () => {
    expect(classifyFailure(rejection(400, "unsupported parameter")).kind).toBe("config");
    expect(classifyFailure(rejection(401, "invalid api key")).kind).toBe("config");
    expect(classifyFailure(rejection(404, "no such model")).kind).toBe("config");
  });

  it("treats throttling and outages as worth retrying", () => {
    expect(classifyFailure(rejection(429, "rate limited")).kind).toBe("transient");
    expect(classifyFailure(rejection(503, "overloaded")).kind).toBe("transient");
  });

  // A DNS failure or a dropped socket carries no status at all.
  it("treats a statusless error as transient", () => {
    expect(classifyFailure(new Error("fetch failed")).kind).toBe("transient");
  });
});

describe("describeFailure", () => {
  // The vendor named the exact offending parameter last time. No message
  // written here could have guessed that, so it is passed through verbatim.
  it("keeps the vendor's own wording and says where to look", () => {
    const line = describeFailure("openai", rejection(400, "reasoning_effort is not supported"));
    expect(line).toContain("openai");
    expect(line).toContain("HTTP 400");
    expect(line).toContain("reasoning_effort is not supported");
    expect(line).toMatch(/AI_PROVIDER/);
  });

  it("does not send someone to their .env over a rate limit", () => {
    const line = describeFailure("openai", rejection(429, "slow down"));
    expect(line).toContain("unreachable");
    expect(line).not.toMatch(/AI_PROVIDER/);
  });
});
