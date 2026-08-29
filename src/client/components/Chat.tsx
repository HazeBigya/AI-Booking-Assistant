"use client";

import { useEffect, useRef, useState } from "react";
import { getChatHistory, resetChat, sendChat, type ChatTurn } from "@client/api/chat";
import { getSession, logout, type SessionUser } from "@client/api/auth";
import { useVoice } from "@client/voice/useVoice";
import { Composer } from "./chat/Composer";
import { MessageBubble } from "./chat/MessageBubble";
import { MessageSkeleton } from "./chat/MessageSkeleton";
import { SessionRail } from "./chat/SessionRail";
import { Suggestions } from "./chat/Suggestions";
import { TypingIndicator } from "./chat/TypingIndicator";
import type { ConversationState } from "./chat/types";

const GREETING: ChatTurn = {
  role: "assistant",
  content:
    "Hi — I'm the receptionist at Bright Smile. I can talk you through our services, tell you which dentist suits what you need, and book you in.",
};

export function Chat() {
  const [messages, setMessages] = useState<ChatTurn[]>([GREETING]);
  const [input, setInput] = useState("");
  const [state, setState] = useState<ConversationState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<SessionUser | null>(null);
  const sending = useRef(false); // synchronous guard against double-submit
  const endRef = useRef<HTMLDivElement>(null);

  const busy = state === "thinking";
  const untouched = messages.length === 1;

  const refreshSession = () =>
    getSession()
      .then((r) => setMe(r.session))
      .catch(() => {});

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
  }, [messages, state]);

  async function newConversation() {
    try {
      await resetChat();
    } catch {
      /* reset the view regardless, so nobody gets stuck in a bad thread */
    }
    setMessages([GREETING]);
    setInput("");
    setError(null);
    setState("idle");
  }

  async function send(text: string = input): Promise<string | null> {
    const body = text.trim();
    if (!body || sending.current) return null;
    sending.current = true;

    const next = [...messages, { role: "user", content: body } as ChatTurn];
    setMessages(next);
    setInput("");
    setError(null);
    setState("thinking");
    try {
      const { reply } = await sendChat(body); // the server holds the history
      setMessages([...next, { role: "assistant", content: reply }]);
      refreshSession(); // they may have just verified their email in-chat
      return reply;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      return null;
    } finally {
      setState("idle");
      sending.current = false;
    }
  }

  // Voice is bookends around the unchanged text pipeline: a transcript goes in
  // through the same send() a typed message uses, and the reply comes back out
  // through TTS. Nothing in between knows which one happened.
  const voice = useVoice({ setState, onTranscript: (text) => send(text) });

  return (
    <div className="flex min-h-[100dvh] flex-col lg:h-[100dvh] lg:flex-row lg:overflow-hidden">
      <SessionRail
        me={me}
        state={state}
        onNewConversation={newConversation}
        onLogout={async () => {
          await logout();
          setMe(null);
        }}
      />

      <main className="flex min-h-0 flex-1 flex-col">
        <div className="scrollbar-slim flex-1 overflow-y-auto px-4 py-8 sm:px-8 lg:px-12">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
            {untouched && (
              <header className="mb-2 max-w-xl">
                <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">
                  Book with a dentist, in a sentence.
                </h1>
                <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-soft">
                  Tell me what you need and when. I check the real schedule before I promise
                  anything.
                </p>
              </header>
            )}

            <div className="stagger flex flex-col gap-5">
              {messages.map((m, i) => (
                <MessageBubble key={i} turn={m} index={Math.min(i, 8)} />
              ))}
            </div>

            {busy && (
              <div className="flex flex-col gap-3">
                <TypingIndicator />
                <MessageSkeleton />
              </div>
            )}

            {error && (
              <p
                role="alert"
                className="animate-rise rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
              >
                {error}
              </p>
            )}

            {untouched && !busy && <Suggestions onPick={send} />}

            <div ref={endRef} />
          </div>
        </div>

        <div className="sticky bottom-0 border-t border-zinc-200/70 bg-zinc-50/85 px-4 py-4 backdrop-blur-md sm:px-8 lg:px-12">
          <div className="mx-auto w-full max-w-3xl">
            <Composer
              value={input}
              onChange={setInput}
              onSend={() => send()}
              onToggleVoice={voice.toggle}
              voiceDisabledReason={voice.disabledReason}
              state={state}
              disabled={busy}
            />
            <p className="mt-2.5 px-1 text-xs text-ink-faint">
              Availability and bookings are confirmed against the clinic&rsquo;s schedule, not
              guessed.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
