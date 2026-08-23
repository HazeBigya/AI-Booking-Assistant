import type { ChatRequest, ChatResponse, LLMProvider } from "./types";

// Composes two providers behind the same interface: try primary, fall back to
// secondary on error (rate limit, outage). Per-call — each request carries full
// context, so a mid-conversation fallback is safe.
export function createFallbackProvider(
  primary: LLMProvider,
  secondary: LLMProvider,
): LLMProvider {
  return {
    name: `${primary.name}->${secondary.name}`,

    async chat(req: ChatRequest): Promise<ChatResponse> {
      try {
        return await primary.chat(req);
      } catch (err) {
        console.warn(`LLM primary (${primary.name}) failed, falling back to ${secondary.name}:`, err);
        return secondary.chat(req);
      }
    },

    async classify(input: string, labels: string[]): Promise<string> {
      try {
        return await primary.classify(input, labels);
      } catch {
        return secondary.classify(input, labels);
      }
    },
  };
}
