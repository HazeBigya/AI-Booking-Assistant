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
      {/* The microphone keeps its own side of the composer and its own job:
          start listening, then show that it is listening. A bare grey glyph
          beside a solid black Send is easy to miss entirely, and a patient who
          never notices the microphone never learns they can speak — so at rest
          it reads as a button. While recording it is the pulsing orb, which is
          the honest picture of a live mic; ending the turn belongs to the
          button on the right, where ending a turn already lives. */}
      <button
        type="button"
        onClick={onToggleVoice}
        disabled={Boolean(voiceDisabledReason)}
        title={voiceDisabledReason ?? (listening ? "Recording — press Stop to send" : "Speak")}
        aria-pressed={listening}
        aria-label={voiceDisabledReason ?? (listening ? "Recording" : "Speak instead of typing")}
        className={
          "grid h-11 w-11 shrink-0 place-items-center rounded-full border transition " +
          "duration-300 ease-glide active:scale-[0.94] disabled:cursor-not-allowed " +
          "disabled:opacity-40 disabled:active:scale-100 " +
          (listening
            ? "border-accent-600/40 bg-accent-50 text-accent-700"
            : "border-zinc-200 bg-zinc-50 text-ink-soft hover:border-zinc-300 " +
              "hover:bg-zinc-100 hover:text-ink")
        }
      >
        {listening ? (
          <VoiceOrb state="listening" />
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

      {/* One button, one meaning: end this turn and send it. Typing, it is Send;
          recording, it is Stop. Putting Stop here rather than on the microphone
          keeps the mic free to be the thing it is good at — showing that the
          clinic is listening — and means a patient looking for "how do I finish"
          finds it in the place they already finish. */}
      <button
        type="button"
        onClick={listening ? onToggleVoice : onSend}
        disabled={listening ? false : disabled || value.trim() === ""}
        aria-label={listening ? "Stop recording and send" : "Send message"}
        title={listening ? "Stop and send" : undefined}
        className={
          "grid h-11 w-11 shrink-0 place-items-center rounded-full transition " +
          "duration-300 ease-glide hover:-translate-y-px active:translate-y-0 " +
          "active:scale-[0.94] disabled:pointer-events-none disabled:bg-zinc-200 " +
          "disabled:text-zinc-400 " +
          (listening ? "bg-accent-600 text-white shadow-diffuse" : "bg-ink text-zinc-50")
        }
      >
        {listening ? (
          <span className="h-3 w-3 rounded-[3px] bg-current" />
        ) : (
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
        )}
      </button>
    </div>
  );
}
