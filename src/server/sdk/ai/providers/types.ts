// Vendor-neutral. The chat loop imports only these, so a new provider drops
// in behind LLMProvider.

export type Role = "system" | "user" | "assistant" | "tool";

export interface ToolCall {
  id: string;
  name: string;
  arguments: string; // raw JSON string exactly as the model emitted it
}

export interface ChatMessage {
  role: Role;
  content: string;
  toolCalls?: ToolCall[]; // assistant asking to call tools
  toolCallId?: string; // on a 'tool' message: which call it answers
  name?: string; // on a 'tool' message: the tool's name
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema for the arguments
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatRequest {
  messages: ChatMessage[];
  tools?: ToolDef[];
  temperature?: number;
}

export interface ChatResponse {
  message: ChatMessage; // assistant reply; may carry toolCalls
  usage: TokenUsage;
}

export interface LLMProvider {
  readonly name: string;
  chat(req: ChatRequest): Promise<ChatResponse>;
  // Enum-only intent gate: returns exactly one of `labels`.
  classify(input: string, labels: string[]): Promise<string>;
}
