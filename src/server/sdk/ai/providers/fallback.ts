import { describeFailure } from "./failure";
import type { ChatRequest, ChatResponse, LLMProvider } from "./types";

// Per-call: each request carries full context, so falling through
// mid-conversation is safe. Throws only if ALL providers fail.
export function createFallbackChain(providers: LLMProvider[]): LLMProvider {
  if (providers.length === 1) return providers[0];

  return {
    name: providers.map((p) => p.name).join("->"),

    async chat(req: ChatRequest): Promise<ChatResponse> {
      let lastError: unknown;
      for (const provider of providers) {
        try {
          return await provider.chat(req);
        } catch (err) {
          lastError = err;
          console.warn(describeFailure(provider.name, err));
        }
      }
      // Rethrown as-is. Wrapping it in a string threw away the status and the
      // vendor's own message, which is exactly what the caller needs to tell a
      // mistyped model name from a network blip.
      throw lastError;
    },

    async classify(input: string, labels: string[]): Promise<string> {
      for (const provider of providers) {
        try {
          return await provider.classify(input, labels);
        } catch {}
      }
      return labels[0]; // gate fails open
    },
  };
}
