"use client";

import { useEffect, useRef } from "react";
import type { ConversationState } from "./types";

const MAX_HEIGHT = 160; // px, matches max-h-40

export function Composer({
  value,
  onChange,
  onSend,
  onToggleVoice,
  voiceDisabledReason,
  state,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onToggleVoice: () => void;
  // Non-null means the mic cannot work, and this says why — naming the missing
  // env var rather than letting the patient press a button that fails.
  voiceDisabledReason?: string | null;
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
      {/* At rest this has to read as a button. A bare grey glyph beside a solid
          black Send disappears, and a patient who never notices the microphone
          never learns the product can be spoken to. While recording it becomes
          an explicit, labelled Stop: silence ends the turn eventually, but
          nobody should have to discover that by waiting. */}
      <button
        type="button"
        onClick={onToggleVoice}
        disabled={Boolean(voiceDisabledReason)}
        title={voiceDisabledReason ?? (listening ? "Stop and send" : "Speak instead of typing")}
        aria-pressed={listening}
        aria-label={voiceDisabledReason ?? (listening ? "Stop recording and send" : "Speak")}
        className={
          "flex h-11 shrink-0 items-center justify-center gap-2 rounded-full border " +
          "text-sm font-medium transition duration-300 ease-glide active:scale-[0.94] " +
          "disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 " +
          (listening
            ? "w-auto border-accent-600 bg-accent-600 px-4 text-white shadow-diffuse"
            : "w-11 border-zinc-200 bg-zinc-50 text-ink-soft hover:border-zinc-300 " +
              "hover:bg-zinc-100 hover:text-ink")
        }
      >
        {listening ? (
          <>
            <span className="grid h-5 w-5 place-items-center">
              <span className="h-2.5 w-2.5 rounded-[2px] bg-current" />
            </span>
            Stop
          </>
        ) : (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            strokeWidth={1.7}
            className="h-5 w-5"
            aria-hidden="true"
          >
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
        <svg
          viewBox="0 0 24 24"
          fill="none"
          strokeWidth={1.5}
          className="h-5 w-5"
          aria-hidden="true"
        >
          <path
            d="M5 12h13M13 6.5 18.5 12 13 17.5"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}
