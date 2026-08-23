import { createBedrockProvider } from "./bedrock";
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

// One provider per process, chosen by LLM_PROVIDER (default openai). DeepSeek
// reuses the OpenAI adapter with a different baseURL — same interface either way.
export function getLLMProvider(): LLMProvider {
  if (cached) return cached;

  const provider = process.env.LLM_PROVIDER ?? "openai";
  switch (provider) {
    case "openai":
      cached = createOpenAIProvider({
        name: "openai",
        apiKey: requireEnv("OPENAI_API_KEY"),
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      });
      break;
    case "deepseek":
      cached = createOpenAIProvider({
        name: "deepseek",
        apiKey: requireEnv("DEEPSEEK_API_KEY"),
        baseURL: "https://api.deepseek.com",
        model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
      });
      break;
    case "bedrock":
      // Credentials via the standard AWS chain (env/role), not an API key.
      cached = createBedrockProvider({
        region: process.env.AWS_REGION ?? "us-east-1",
        modelId: requireEnv("BEDROCK_MODEL_ID"),
      });
      break;
    default:
      throw new Error(`Unknown LLM_PROVIDER "${provider}". Use "openai", "deepseek", or "bedrock".`);
  }
  return cached;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. See .env.example.`);
  return value;
}
