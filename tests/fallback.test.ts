import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFallbackChain } from "@server/sdk/ai/providers/fallback";
import type { ChatRequest, LLMProvider } from "@server/sdk/ai/providers/types";

// The chain warns when a provider fails; that's expected here, so keep the test
// output clean by silencing it.
beforeEach(() => vi.spyOn(console, "warn").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

// Fake provider: succeeds returning its own name, or throws if `fail`.
function fakeProvider(name: string, fail = false): LLMProvider {
  return {
    name,
    async chat(_req: ChatRequest) {
      if (fail) throw new Error(`${name} down`);
      return {
        message: { role: "assistant", content: name },
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 1 },
      };
    },
    async classify() {
      if (fail) throw new Error(`${name} down`);
      return "in_scope";
    },
  };
}

const req: ChatRequest = { messages: [] };

describe("createFallbackChain", () => {
  it("returns the first successful provider", async () => {
    const chain = createFallbackChain([fakeProvider("a"), fakeProvider("b")]);
    expect((await chain.chat(req)).message.content).toBe("a");
  });

  it("falls through to the next when one fails", async () => {
    const chain = createFallbackChain([fakeProvider("a", true), fakeProvider("b")]);
    expect((await chain.chat(req)).message.content).toBe("b");
  });

  it("throws only when every provider fails", async () => {
    const chain = createFallbackChain([fakeProvider("a", true), fakeProvider("b", true)]);
    await expect(chain.chat(req)).rejects.toThrow();
  });

  it("classify fails open to the first label when all fail", async () => {
    const chain = createFallbackChain([fakeProvider("a", true), fakeProvider("b", true)]);
    expect(await chain.classify("hi", ["in_scope", "out_of_scope"])).toBe("in_scope");
  });

  it("returns a single provider unwrapped", () => {
    const only = fakeProvider("solo");
    expect(createFallbackChain([only])).toBe(only);
  });
});
