import { http } from "./http";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

// The server holds the conversation, keyed by the chat-session cookie. The
// browser's zone rides along so times can be shown on the patient's own clock.
export function sendChat(message: string) {
  return http.post<{ reply: string; totalTokens: number }>("/api/chat", {
    message,
    timeZone: browserTimeZone(),
  });
}

function browserTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

// Load the persisted conversation for this browser's chat session (survives refresh).
export function getChatHistory() {
  return http.get<{ messages: ChatTurn[] }>("/api/chat/history");
}

// Start a fresh conversation (clears the chat-session cookie; keeps you logged in).
export function resetChat() {
  return http.post<{ ok: boolean }>("/api/chat/reset", {});
}
