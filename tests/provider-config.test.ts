import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// getLLMProvider memoises its result, so each case re-imports the module fresh.
async function load() {
  vi.resetModules();
  return import("@server/sdk/ai/providers");
}

const AI_VARS = [
  "AI_PROVIDER",
  "LLM_PROVIDERS",
  "LLM_PROVIDER",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_MODEL",
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_MODEL",
  "GEMINI_API_KEY",
  "OPENROUTER_API_KEY",
  "CUSTOM_BASE_URL",
  "CUSTOM_API_KEY",
  "CUSTOM_MODEL",
  "OPENROUTER_MODEL",
];

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(AI_VARS.map((k) => [k, process.env[k]]));
  for (const k of AI_VARS) delete process.env[k];
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.restoreAllMocks();
});

describe("AI_PROVIDER picks the provider", () => {
  it("builds from AI_PROVIDER plus that vendor's key", async () => {
    process.env.AI_PROVIDER = "deepseek";
    process.env.DEEPSEEK_API_KEY = "sk-test";

    const { getLLMProvider } = await load();
    expect(getLLMProvider().name).toBe("deepseek");
  });

  it("reads each vendor's own key variable", async () => {
    process.env.AI_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "sk-test";

    const { getLLMProvider } = await load();
    expect(getLLMProvider().name).toBe("anthropic");
  });

  it("honours the vendor's MODEL variable", async () => {
    process.env.AI_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "sk-test";
    process.env.ANTHROPIC_MODEL = "claude-opus-5";

    const { getLLMProvider } = await load();
    expect(getLLMProvider().name).toBe("anthropic");
  });

  it("treats blank values as unset — compose passes empty strings", async () => {
    process.env.AI_PROVIDER = "deepseek";
    process.env.DEEPSEEK_API_KEY = "sk-test";
    process.env.DEEPSEEK_MODEL = "   "; // blank, not a model id
    process.env.LLM_PROVIDERS = "";

    const { getLLMProvider } = await load();
    expect(getLLMProvider().name).toBe("deepseek");
  });

  it("requires the custom endpoint's base URL", async () => {
    process.env.AI_PROVIDER = "custom";
    process.env.CUSTOM_API_KEY = "sk-test";
    process.env.CUSTOM_MODEL = "some-model";

    const { getLLMProvider } = await load();
    expect(() => getLLMProvider()).toThrow(/CUSTOM_BASE_URL/);
  });
});

describe("a comma-separated list is the failover priority", () => {
  it("uses the first provider that is usable", async () => {
    process.env.AI_PROVIDER = "anthropic,deepseek";
    process.env.ANTHROPIC_API_KEY = "sk-anthropic";
    process.env.DEEPSEEK_API_KEY = "sk-deepseek";

    const { getLLMProvider } = await load();
    // The chain names itself in priority order.
    expect(getLLMProvider().name).toBe("anthropic->deepseek");
  });

  it("skips an entry whose key is missing and keeps the rest", async () => {
    process.env.AI_PROVIDER = "openai,deepseek"; // no OpenAI key
    process.env.DEEPSEEK_API_KEY = "sk-test";

    const { getLLMProvider } = await load();
    expect(getLLMProvider().name).toBe("deepseek");
  });

  it("splits an inline model id on the FIRST colon only", async () => {
    process.env.AI_PROVIDER = "openrouter:z-ai/glm-5.2:free";
    process.env.OPENROUTER_API_KEY = "sk-test";

    const { getLLMProvider } = await load();
    expect(getLLMProvider().name).toContain("z-ai/glm-5.2:free");
  });

  it("still accepts LLM_PROVIDERS as a backwards-compatible alias", async () => {
    process.env.LLM_PROVIDERS = "deepseek";
    process.env.DEEPSEEK_API_KEY = "sk-test";

    const { getLLMProvider } = await load();
    expect(getLLMProvider().name).toBe("deepseek");
  });
});

describe("misconfiguration is legible", () => {
  it("says what to set when nothing is configured", async () => {
    const { getLLMProvider } = await load();
    expect(() => getLLMProvider()).toThrow(/AI_PROVIDER/);
  });

  it("lists the valid providers when the name is wrong", async () => {
    process.env.AI_PROVIDER = "claude"; // not a provider name
    process.env.ANTHROPIC_API_KEY = "sk-test";

    const { getLLMProvider } = await load();
    expect(() => getLLMProvider()).toThrow(/anthropic/);
  });

  it("names the missing key variable", async () => {
    process.env.AI_PROVIDER = "anthropic"; // no key anywhere

    const { getLLMProvider } = await load();
    expect(() => getLLMProvider()).toThrow(/ANTHROPIC_API_KEY/);
  });
});
