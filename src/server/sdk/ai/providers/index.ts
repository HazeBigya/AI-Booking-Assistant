import { createBedrockProvider } from "./bedrock";
import { createFallbackChain } from "./fallback";
import { createGeminiProvider } from "./gemini";
import { createOpenAIProvider } from "./openai";
import type { LLMProvider } from "./types";

export type { ChatMessage, ChatRequest, ChatResponse, LLMProvider, Role, TokenUsage, ToolCall, ToolDef } from "./types";

let cached: LLMProvider | undefined;

// Most vendors expose an OpenAI-compatible endpoint, so a new one is a row here
// rather than an adapter. `custom` reaches any other compatible endpoint.
// Bedrock has no compatible surface and keeps a native adapter.
interface CompatibleVendor {
  label: string;
  baseURL?: string; // undefined = OpenAI's own default
  keyEnv: string;
  modelEnv: string;
  defaultModel: string;
}

export const OPENAI_COMPATIBLE: Record<string, CompatibleVendor> = {
  openai: {
    label: "OpenAI",
    keyEnv: "OPENAI_API_KEY",
    modelEnv: "OPENAI_MODEL",
    defaultModel: "gpt-4o-mini",
  },
  anthropic: {
    label: "Anthropic Claude",
    baseURL: "https://api.anthropic.com/v1/",
    keyEnv: "ANTHROPIC_API_KEY",
    modelEnv: "ANTHROPIC_MODEL",
    defaultModel: "claude-sonnet-5",
  },
  deepseek: {
    label: "DeepSeek",
    baseURL: "https://api.deepseek.com",
    keyEnv: "DEEPSEEK_API_KEY",
    modelEnv: "DEEPSEEK_MODEL",
    defaultModel: "deepseek-v4-pro",
  },
  gemini: {
    label: "Google Gemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    keyEnv: "GEMINI_API_KEY",
    modelEnv: "GEMINI_MODEL",
    defaultModel: "gemini-3.5-flash-lite",
  },
  openrouter: {
    label: "OpenRouter (gateway to many vendors)",
    baseURL: "https://openrouter.ai/api/v1",
    keyEnv: "OPENROUTER_API_KEY",
    modelEnv: "OPENROUTER_MODEL",
    defaultModel: "deepseek/deepseek-chat-v3.1:free",
  },
  custom: {
    label: "Any OpenAI-compatible endpoint (set CUSTOM_BASE_URL)",
    keyEnv: "CUSTOM_API_KEY",
    modelEnv: "CUSTOM_MODEL",
    defaultModel: "",
  },
};

const NATIVE_PROVIDERS = ["gemini-native", "bedrock"] as const;

export function providerNames(): string[] {
  return [...Object.keys(OPENAI_COMPATIBLE), ...NATIVE_PROVIDERS];
}

// A comma-separated AI_PROVIDER is a failover chain tried left to right, so the
// order written is the priority. LLM_PROVIDERS is a legacy alias.
function configuredEntries(): string[] {
  const configured = env("AI_PROVIDER") ?? env("LLM_PROVIDERS") ?? env("LLM_PROVIDER") ?? "";
  return configured
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getLLMProvider(): LLMProvider {
  if (cached) return cached;

  const entries = configuredEntries();
  if (entries.length === 0) {
    throw new Error(
      "No AI provider configured. In .env set AI_PROVIDER plus that provider's key — " +
        `e.g. AI_PROVIDER=deepseek and DEEPSEEK_API_KEY=... . ` +
        `Valid providers: ${providerNames().join(", ")}. See .env.example.`,
    );
  }

  const providers: LLMProvider[] = [];
  const problems: string[] = [];
  for (const entry of entries) {
    const sep = entry.indexOf(":"); // split on the FIRST colon; model ids contain ':'
    const name = sep === -1 ? entry : entry.slice(0, sep);
    const model = sep === -1 ? undefined : entry.slice(sep + 1);
    try {
      providers.push(buildProvider(name, model));
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      problems.push(`  "${entry}" — ${reason}`);
      console.warn(`Skipping AI provider "${entry}": ${reason}`);
    }
  }

  if (providers.length === 0) {
    throw new Error(
      `No AI provider could be configured.\n${problems.join("\n")}\n` +
        `Valid providers: ${providerNames().join(", ")}. See .env.example.`,
    );
  }

  cached = createFallbackChain(providers);
  return cached;
}

function buildProvider(name: string, model?: string): LLMProvider {
  if (name === "bedrock") {
    // Credentials via the standard AWS chain (env/role), not an API key.
    return createBedrockProvider({
      region: process.env.AWS_REGION ?? "us-east-1",
      modelId: model ?? requireEnv("BEDROCK_MODEL_ID"),
    });
  }
  if (name === "gemini-native") {
    return createGeminiProvider({
      apiKey: resolveKey(OPENAI_COMPATIBLE.gemini),
      model: model ?? env("GEMINI_MODEL") ?? OPENAI_COMPATIBLE.gemini.defaultModel,
    });
  }

  const vendor = OPENAI_COMPATIBLE[name];
  if (!vendor) {
    throw new Error(`unknown provider. Valid providers: ${providerNames().join(", ")}`);
  }

  const baseURL = name === "custom" ? requireEnv("CUSTOM_BASE_URL") : vendor.baseURL;
  const resolvedModel = model ?? env(vendor.modelEnv) ?? vendor.defaultModel;
  if (!resolvedModel) {
    throw new Error(`no model set. Set ${vendor.modelEnv} to a model id`);
  }

  return createOpenAIProvider({
    name: model ? `${name}(${model})` : name,
    apiKey: resolveKey(vendor),
    baseURL,
    model: resolvedModel,
  });
}

// Per-vendor keys are what let several be configured at once for the chain.
function resolveKey(vendor: CompatibleVendor): string {
  const key = env(vendor.keyEnv);
  if (!key) throw new Error(`no API key. Set ${vendor.keyEnv} to your ${vendor.label} key`);
  return key;
}

// compose passes unset variables through as empty strings, which `??` accepts.
function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function requireEnv(name: string): string {
  const value = env(name);
  if (!value) throw new Error(`${name} is not set`);
  return value;
}
