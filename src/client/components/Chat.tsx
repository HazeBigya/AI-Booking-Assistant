"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getChatHistory, resetChat, sendChat, type ChatTurn } from "@client/api/chat";
import { getSession, logout, type SessionUser } from "@client/api/auth";

const GREETING: ChatTurn = {
  role: "assistant",
  content: "Hi! I'm the clinic's virtual receptionist. I can help you explore our services and book an appointment. What do you need?",
};

export function Chat() {
  const [messages, setMessages] = useState<ChatTurn[]>([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<SessionUser | null>(null);
  const sending = useRef(false); // synchronous guard against double-submit
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Refocus once the input re-enables, so you can keep typing.
  useEffect(() => {
    if (!loading) inputRef.current?.focus();
  }, [loading]);

  const refreshSession = () => getSession().then((r) => setMe(r.session)).catch(() => {});

  useEffect(() => {
    refreshSession();
    getChatHistory()
      .then((r) => {
        if (r.messages.length > 0) setMessages(r.messages);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function newConversation() {
    try {
      await resetChat();
    } catch {
      /* even if the call fails, reset the view so the user isn't stuck */
    }
    setMessages([GREETING]);
    setInput("");
    setError(null);
  }

  async function send() {
    const text = input.trim();
    if (!text || sending.current) return;
    sending.current = true;

    const next = [...messages, { role: "user", content: text } as ChatTurn];
    setMessages(next);
    setInput("");
    setError(null);
    setLoading(true);
    try {
      const { reply } = await sendChat(text); // server holds history; send just the new message
      setMessages([...next, { role: "assistant", content: reply }]);
      refreshSession(); // the patient may have just verified their email in-chat
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
      sending.current = false;
    }
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-slate-50">
      <header className="flex items-center border-b bg-white px-4 py-3">
        <span className="flex-1" />
        <span className="font-semibold text-slate-800">🦷 Bright Smile Clinic</span>
        <span className="flex flex-1 items-center justify-end gap-3 text-xs">
          <button className="text-blue-600" onClick={newConversation}>
            New conversation
          </button>
          {me && (
            <span className="flex items-center gap-2">
              <span className="text-slate-500">{me.name}</span>
              <button
                className="text-blue-600"
                onClick={async () => {
                  await logout();
                  setMe(null);
                }}
              >
                Log out
              </button>
            </span>
          )}
        </span>
      </header>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-3 overflow-y-auto p-4">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                "max-w-[85%] rounded-2xl px-4 py-2 text-sm " +
                (m.role === "user" ? "bg-blue-600 text-white" : "bg-white text-slate-800 shadow")
              }
            >
              {m.role === "assistant" ? (
                <div className="prose prose-sm max-w-none overflow-x-auto prose-table:my-2 prose-p:my-1.5">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                </div>
              ) : (
                <span className="whitespace-pre-wrap">{m.content}</span>
              )}
            </div>
          </div>
        ))}
        {loading && <div className="text-sm text-slate-400">typing…</div>}
        {error && <div className="text-sm text-red-500">{error}</div>}
        <div ref={endRef} />
      </div>

      <div className="mx-auto flex w-full max-w-2xl gap-2 p-4">
        <input
          ref={inputRef}
          autoFocus
          className="flex-1 rounded-full border px-4 py-2 text-sm outline-none focus:border-blue-500"
          placeholder="Type a message…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          disabled={loading}
        />
        <button
          className="rounded-full bg-blue-600 px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
          onClick={send}
          disabled={loading}
        >
          Send
        </button>
      </div>
    </div>
  );
}
