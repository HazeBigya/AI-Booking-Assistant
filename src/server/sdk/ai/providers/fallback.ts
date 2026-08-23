import type { ChatRequest, ChatResponse, LLMProvider } from "./types";

// Tries providers in priority order; returns the first success. Per-call — each
// request carries full context, so falling through mid-conversation is safe.
// Throws only if ALL providers fail; the caller then shows a deterministic,
// honest "can't connect" message rather than a crash.
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
          console.warn(`LLM ${provider.name} failed, trying next:`, err);
        }
      }
      throw new Error(`All LLM providers failed: ${String(lastError)}`);
    },

    async classify(input: string, labels: string[]): Promise<string> {
      for (const provider of providers) {
        try {
          return await provider.classify(input, labels);
        } catch {
          // try the next provider
        }
      }
      return labels[0]; // gate fails open
    },
  };
}
