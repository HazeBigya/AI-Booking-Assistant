import { http } from "./http";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export function sendChat(messages: ChatTurn[]) {
  return http.post<{ reply: string; totalTokens: number }>("/api/chat", { messages });
}
