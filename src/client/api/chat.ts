import { http } from "./http";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

// Send one message; the server holds the conversation (keyed by the chat-session
// cookie) and returns the assistant's reply.
export function sendChat(message: string) {
  return http.post<{ reply: string; totalTokens: number }>("/api/chat", { message });
}

// Load the persisted conversation for this browser's chat session (survives refresh).
export function getChatHistory() {
  return http.get<{ messages: ChatTurn[] }>("/api/chat/history");
}

// Start a fresh conversation (clears the chat-session cookie; keeps you logged in).
export function resetChat() {
  return http.post<{ ok: boolean }>("/api/chat/reset", {});
}
