"use client";

import { useEffect, useRef } from "react";
import { VoiceOrb } from "./VoiceOrb";
import type { ConversationState } from "./types";

const MAX_HEIGHT = 160; // px, matches max-h-40

export function Composer({
  value,
  onChange,
  onSend,
  onToggleVoice,
  state,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onToggleVoice: () => void;
  state: ConversationState;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listening = state === "listening";

  useEffect(() => {
    if (!disabled) inputRef.current?.focus();
  }, [disabled]);

  // Grow with the message instead of scrolling a one-line box. Overflow stays
  // hidden until the box is actually full, otherwise sub-pixel line-height
  // rounding leaves a scrollbar track visible on a single empty line.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, MAX_HEIGHT);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > MAX_HEIGHT ? "auto" : "hidden";
  }, [value]);

  return (
    <div
      className={
        "flex items-end gap-2 rounded-3xl border bg-white p-2 shadow-diffuse transition duration-300 ease-glide " +
        (listening ? "border-accent-600/40 ring-4 ring-accent-400/10" : "border-zinc-200")
      }
    >
      <button
        type="button"
        onClick={onToggleVoice}
        aria-pressed={listening}
        aria-label={listening ? "Stop voice input" : "Start voice input"}
        className={
          "grid h-11 w-11 shrink-0 place-items-center rounded-full transition duration-300 ease-glide " +
          "active:scale-[0.94] " +
          (listening
            ? "bg-accent-50 text-accent-700"
            : "text-ink-faint hover:bg-zinc-100 hover:text-ink-soft")
        }
      >
        {listening ? (
          <VoiceOrb state="listening" />
        ) : (
          <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} className="h-5 w-5" aria-hidden="true">
            <path
              d="M12 4.5a2.5 2.5 0 0 1 2.5 2.5v5a2.5 2.5 0 0 1-5 0V7A2.5 2.5 0 0 1 12 4.5ZM6 11v1a6 6 0 0 0 12 0v-1M12 18.5V21"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>

      <textarea
        ref={inputRef}
        rows={1}
        value={value}
        disabled={disabled}
        placeholder={listening ? "Listening…" : "Ask about services, or book an appointment"}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        className="scrollbar-slim max-h-40 flex-1 resize-none overflow-hidden bg-transparent px-1 py-2.5 text-[0.9375rem] leading-relaxed
          text-ink outline-none placeholder:text-ink-faint disabled:opacity-60"
      />

      <button
        type="button"
        onClick={onSend}
        disabled={disabled || value.trim() === ""}
        aria-label="Send message"
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink text-zinc-50
          transition duration-300 ease-glide hover:-translate-y-px active:translate-y-0 active:scale-[0.94]
          disabled:pointer-events-none disabled:bg-zinc-200 disabled:text-zinc-400"
      >
        <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} className="h-5 w-5" aria-hidden="true">
          <path d="M5 12h13M13 6.5 18.5 12 13 17.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
