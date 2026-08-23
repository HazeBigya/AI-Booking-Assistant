import { createBedrockProvider } from "./bedrock";
import { createFallbackChain } from "./fallback";
import { createGeminiProvider } from "./gemini";
import { createOpenAIProvider } from "./openai";
import type { LLMProvider } from "./types";

export type {
  ChatMessage,
  ChatRequest,
  ChatResponse,
  LLMProvider,
  Role,
  TokenUsage,
  ToolCall,
  ToolDef,
} from "./types";

let cached: LLMProvider | undefined;

// Priority chain from LLM_PROVIDERS (comma-separated), tried in order. Each entry
// is "provider" or "provider:model" — so the same provider can appear multiple
// times with different models (e.g. three OpenRouter free models). Entries whose
// keys are missing are skipped (not fatal); the chain adapts to what's configured.
export function getLLMProvider(): LLMProvider {
  if (cached) return cached;

  const entries = (process.env.LLM_PROVIDERS ?? process.env.LLM_PROVIDER ?? "openai")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const providers: LLMProvider[] = [];
  for (const entry of entries) {
    const sep = entry.indexOf(":"); // split on the FIRST colon; model ids contain ':'
    const name = sep === -1 ? entry : entry.slice(0, sep);
    const model = sep === -1 ? undefined : entry.slice(sep + 1);
    try {
      providers.push(buildProvider(name, model));
    } catch (err) {
      console.warn(`Skipping LLM provider "${entry}" (not configured):`, err);
    }
  }
  if (providers.length === 0) {
    throw new Error("No LLM provider configured. Set LLM_PROVIDERS and the matching API keys.");
  }

  cached = createFallbackChain(providers);
  return cached;
}

function buildProvider(name: string, model?: string): LLMProvider {
  switch (name) {
    case "openai":
      return createOpenAIProvider({
        name: "openai",
        apiKey: requireEnv("OPENAI_API_KEY"),
        model: model ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      });
    case "deepseek":
      return createOpenAIProvider({
        name: "deepseek",
        apiKey: requireEnv("DEEPSEEK_API_KEY"),
        baseURL: "https://api.deepseek.com",
        model: model ?? process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
      });
    case "gemini":
      // Native @google/genai SDK (not the OpenAI-compat endpoint).
      return createGeminiProvider({
        apiKey: requireEnv("GEMINI_API_KEY"),
        model: model ?? process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite",
      });
    case "openrouter":
      // OpenRouter is OpenAI-wire compatible — same adapter, one gateway to many
      // models (incl. free ":free" variants). Pick a model that supports tools.
      return createOpenAIProvider({
        name: `openrouter(${model ?? process.env.OPENROUTER_MODEL ?? "default"})`,
        apiKey: requireEnv("OPENROUTER_API_KEY"),
        baseURL: "https://openrouter.ai/api/v1",
        model: model ?? process.env.OPENROUTER_MODEL ?? "deepseek/deepseek-chat-v3.1:free",
      });
    case "bedrock":
      // Credentials via the standard AWS chain (env/role), not an API key.
      return createBedrockProvider({
        region: process.env.AWS_REGION ?? "us-east-1",
        modelId: model ?? requireEnv("BEDROCK_MODEL_ID"),
      });
    default:
      throw new Error(
        `Unknown provider "${name}". Use openai, deepseek, gemini, bedrock, or openrouter.`,
      );
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. See .env.example.`);
  return value;
}
