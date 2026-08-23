import { createBedrockProvider } from "./bedrock";
import { createFallbackProvider } from "./fallback";
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

// Provider chosen by LLM_PROVIDER (default openai). Optional LLM_FALLBACK wraps
// it so a primary outage/rate-limit falls back to a second vendor. OpenAI,
// DeepSeek, and Gemini all share the OpenAI wire format (different baseURL);
// Bedrock has its own adapter — all behind the same LLMProvider interface.
export function getLLMProvider(): LLMProvider {
  if (cached) return cached;

  const primaryName = process.env.LLM_PROVIDER ?? "openai";
  const primary = buildProvider(primaryName);

  const fallbackName = process.env.LLM_FALLBACK;
  cached =
    fallbackName && fallbackName !== primaryName
      ? createFallbackProvider(primary, buildProvider(fallbackName))
      : primary;
  return cached;
}

function buildProvider(name: string): LLMProvider {
  switch (name) {
    case "openai":
      return createOpenAIProvider({
        name: "openai",
        apiKey: requireEnv("OPENAI_API_KEY"),
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      });
    case "deepseek":
      return createOpenAIProvider({
        name: "deepseek",
        apiKey: requireEnv("DEEPSEEK_API_KEY"),
        baseURL: "https://api.deepseek.com",
        model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
      });
    case "gemini":
      // Gemini's OpenAI-compatible endpoint — same adapter, different baseURL.
      // No trailing slash: the SDK appends "/chat/completions".
      return createOpenAIProvider({
        name: "gemini",
        apiKey: requireEnv("GEMINI_API_KEY"),
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
        model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
      });
    case "bedrock":
      // Credentials via the standard AWS chain (env/role), not an API key.
      return createBedrockProvider({
        region: process.env.AWS_REGION ?? "us-east-1",
        modelId: requireEnv("BEDROCK_MODEL_ID"),
      });
    default:
      throw new Error(`Unknown provider "${name}". Use openai, deepseek, gemini, or bedrock.`);
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. See .env.example.`);
  return value;
}
