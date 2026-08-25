import { getLLMProvider, type ChatMessage } from "./providers";
import { runTool, toolDefs, type ToolContext } from "./tools";

// Cap the tool-calling loop so a confused model can't spin forever (cost + latency).
const MAX_ITERATIONS = 5;

const FALLBACK_REPLY =
  "Sorry, I'm having trouble completing that right now. Please try again, or rephrase your request.";

export interface ChatResult {
  reply: string;
  messages: ChatMessage[]; // full history incl. assistant + tool messages, to persist
  totalTokens: number;
}

// Hand-written tool-calling loop. Transport-agnostic: takes text history, returns
// text reply. The model can only *act* through validated tools (runTool).
export async function runChat(history: ChatMessage[], ctx: ToolContext = {}): Promise<ChatResult> {
  const provider = getLLMProvider();
  const messages: ChatMessage[] = [...history];
  let totalTokens = 0;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    // temperature 0: this is a tool-calling agent, not a creative writer. We want
    // it to faithfully call tools and report their results, not improvise.
    const { message, usage } = await provider.chat({ messages, tools: toolDefs, temperature: 0 });
    totalTokens += usage.totalTokens;
    messages.push(message); // assistant turn (may carry toolCalls) — push BEFORE results

    if (!message.toolCalls || message.toolCalls.length === 0) {
      return { reply: message.content, messages, totalTokens };
    }

    // Answer every tool call in this turn, then let the model see the results.
    for (const call of message.toolCalls) {
      console.log(`[tool] call ${call.name} args=${call.arguments}`);
      const result = await runTool(call.name, call.arguments, ctx);
      console.log(`[tool] result ${call.name} -> ${result.slice(0, 400)}`);
      messages.push({ role: "tool", content: result, toolCallId: call.id, name: call.name });
    }
  }

  return { reply: FALLBACK_REPLY, messages, totalTokens };
}
