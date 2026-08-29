"use client";

import { ClinicMark } from "./ClinicMark";
import { VoiceOrb } from "./VoiceOrb";
import type { SessionUser } from "@client/api/auth";
import type { ConversationState } from "./types";

const STATUS: Record<ConversationState, string> = {
  idle: "Ready",
  listening: "Listening",
  thinking: "Checking the schedule",
  speaking: "Speaking",
};

export function SessionRail({
  me,
  state,
  onNewConversation,
  onLogout,
}: {
  me: SessionUser | null;
  state: ConversationState;
  onNewConversation: () => void;
  onLogout: () => void;
}) {
  return (
    <aside
      className="flex shrink-0 flex-col border-b border-zinc-200/70 bg-zinc-50
        lg:h-full lg:w-76 lg:border-b-0 lg:border-r"
    >
      <div className="flex items-center gap-3 px-6 py-5 lg:px-7 lg:py-7">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink text-zinc-50">
          <ClinicMark />
        </span>
        <div className="leading-tight">
          <p className="font-medium tracking-tight">Bright Smile</p>
          <p className="text-xs text-ink-faint">Dental clinic</p>
        </div>
      </div>

      {/* Only this middle band scrolls, and only if it ever needs to. */}
      <div className="hidden min-h-0 flex-1 overflow-y-auto px-7 pb-6 lg:block">
        <p className="text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-ink-faint">
          Reception
        </p>
        <div className="mt-3 flex items-center gap-2.5">
          <VoiceOrb state={state} />
          <span className="text-sm text-ink-soft">{STATUS[state]}</span>
        </div>

        <dl className="mt-8 divide-y divide-zinc-200/70 border-y border-zinc-200/70 text-sm">
          <div className="flex items-baseline justify-between py-3">
            <dt className="text-ink-faint">Open</dt>
            <dd className="text-ink-soft">Mon – Fri</dd>
          </div>
          <div className="flex items-baseline justify-between py-3">
            <dt className="text-ink-faint">Hours</dt>
            <dd className="text-ink-soft">9:00 AM – 5:00 PM</dd>
          </div>
          <div className="flex items-baseline justify-between py-3">
            <dt className="text-ink-faint">Dentists</dt>
            <dd className="text-ink-soft">3 on staff</dd>
          </div>
        </dl>
      </div>

      <AccountSection me={me} onNewConversation={onNewConversation} onLogout={onLogout} />
    </aside>
  );
}

// Pinned to the foot of the rail and split off by a full-bleed rule — the
// account block reads as its own surface rather than a stray pair of links.
function AccountSection({
  me,
  onNewConversation,
  onLogout,
}: {
  me: SessionUser | null;
  onNewConversation: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="border-t border-zinc-200/70 px-4 py-4 lg:px-5 lg:py-5">
      <button
        type="button"
        onClick={onNewConversation}
        className="group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm text-ink-soft
          transition duration-300 ease-glide hover:bg-white hover:text-ink hover:shadow-diffuse
          active:scale-[0.99]"
      >
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-zinc-200
            bg-white text-ink-faint transition-colors duration-300 ease-glide group-hover:text-ink"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            strokeWidth={1.5}
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path d="M12 6v12M6 12h12" stroke="currentColor" strokeLinecap="round" />
          </svg>
        </span>
        New conversation
      </button>

      {me ? (
        <div
          className="mt-1 flex items-center gap-3 rounded-2xl px-3 py-2.5 transition duration-300
            ease-glide hover:bg-white hover:shadow-diffuse"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink text-sm font-medium text-zinc-50">
            {me.name.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium tracking-tight">{me.name}</p>
            <p className="truncate text-xs text-ink-faint" title={me.email}>
              {me.email}
            </p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            aria-label="Log out"
            title="Log out"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-faint
              transition duration-300 ease-glide hover:bg-zinc-100 hover:text-ink active:scale-[0.94]"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              strokeWidth={1.5}
              className="h-[18px] w-[18px]"
              aria-hidden="true"
            >
              <path
                d="M15 5.5V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-.5M11 12h9m0 0-3-3m3 3-3 3"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      ) : (
        <div className="mt-1 flex items-center gap-3 px-3 py-2.5">
          <span className="h-9 w-9 shrink-0 rounded-full border border-dashed border-zinc-300" />
          <p className="text-xs leading-relaxed text-ink-faint">
            Not signed in — verify your email in the chat to book.
          </p>
        </div>
      )}
    </div>
  );
}
