import { describe, expect, it, vi } from "vitest";

const create = vi.fn();
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create } };
  },
}));

const { createOpenAIProvider } = await import("@server/sdk/ai/providers/openai");

function reasoningRejection() {
  return Object.assign(new Error("400"), {
    status: 400,
    param: "reasoning_effort",
    error: { message: "Function tools with reasoning_effort are not supported" },
  });
}

const ok = {
  choices: [{ message: { content: "Kate is free at nine.", tool_calls: undefined } }],
  usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
};

const req = { messages: [{ role: "user" as const, content: "when is Kate free?" }], tools: [] };

// Reasoning models refuse function tools on this endpoint unless reasoning is
// explicitly off. Which models those are is not knowable from here — the one
// that hit this shipped after the adapter — so the recovery is driven by the
// API's own complaint rather than by a list of names that goes stale.
describe("reasoning-model tool compatibility", () => {
  it("retries with reasoning off and returns the reply", async () => {
    create.mockReset();
    create.mockRejectedValueOnce(reasoningRejection()).mockResolvedValueOnce(ok);

    const provider = createOpenAIProvider({ name: "openai", apiKey: "sk", model: "some-model" });
    const res = await provider.chat(req);

    expect(res.message.content).toBe("Kate is free at nine.");
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0][0]).not.toHaveProperty("reasoning_effort");
    expect(create.mock.calls[1][0]).toMatchObject({ reasoning_effort: "none" });
  });

  // A tool loop makes several calls per turn; paying a guaranteed 400 on each
  // would triple the latency of every booking.
  it("remembers, so the next call does not repeat the failed attempt", async () => {
    create.mockReset();
    create.mockRejectedValueOnce(reasoningRejection()).mockResolvedValue(ok);

    const provider = createOpenAIProvider({ name: "openai", apiKey: "sk", model: "some-model" });
    await provider.chat(req);
    await provider.chat(req);

    expect(create).toHaveBeenCalledTimes(3); // failed, retried, then straight through
    expect(create.mock.calls[2][0]).toMatchObject({ reasoning_effort: "none" });
  });

  // Retrying a key or quota error would just fail twice and hide the real cause.
  it("does not retry an unrelated failure", async () => {
    create.mockReset();
    create.mockRejectedValue(Object.assign(new Error("401"), { status: 401 }));

    const provider = createOpenAIProvider({ name: "openai", apiKey: "sk", model: "gpt-4o-mini" });
    await expect(provider.chat(req)).rejects.toThrow("401");
    expect(create).toHaveBeenCalledTimes(1);
  });
});
