import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatTurn } from "@client/api/chat";

export function MessageBubble({
  turn,
  index,
  onSpeak,
  speaking,
}: {
  turn: ChatTurn;
  index: number;
  // Absent when voice is not configured, which is also why the control is not
  // rendered at all rather than rendered disabled: a button nobody can use is
  // just an unanswered question about why.
  onSpeak?: () => void;
  // True from the moment this reply starts being turned into audio until the
  // last sentence has played. Owned by the voice hook rather than by this
  // component, so a reply spoken by the microphone shows it too — not only one
  // the reader started by pressing Listen.
  speaking?: boolean;
}) {
  const mine = turn.role === "user";

  return (
    <div
      className={mine ? "flex justify-end" : "flex justify-start"}
      style={{ "--index": index } as React.CSSProperties}
    >
      <div
        className={
          "max-w-[85%] px-4 py-3 text-[0.9375rem] leading-relaxed sm:max-w-[78%] " +
          (mine
            ? "rounded-2xl rounded-br-md bg-ink text-zinc-50"
            : "rounded-2xl rounded-bl-md border border-zinc-200/70 bg-white text-ink shadow-diffuse")
        }
      >
        {mine ? (
          <span className="whitespace-pre-wrap">{turn.content}</span>
        ) : (
          <>
            <div
              className="prose prose-sm max-w-none overflow-x-auto text-ink
                prose-p:my-1.5 prose-headings:font-medium prose-headings:tracking-tight
                prose-strong:text-ink prose-table:my-3 prose-table:text-sm
                prose-th:font-medium prose-th:text-ink-soft prose-td:py-1.5
                prose-li:my-0.5 prose-a:text-accent-700"
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{turn.content}</ReactMarkdown>
            </div>
            {/* Outside the prose wrapper: this is a control, and the typography
                plugin styles anything inside as if it were prose. */}
            {onSpeak && (
              <button
                type="button"
                onClick={onSpeak}
                aria-busy={speaking}
                aria-label="Read this reply aloud"
                title="Read aloud"
                className={
                  "mt-2.5 -ml-1.5 flex items-center gap-1.5 rounded-lg border px-2.5 py-1 " +
                  "text-xs font-medium transition focus-visible:outline-2 " +
                  "focus-visible:outline-offset-2 focus-visible:outline-accent-600 " +
                  (speaking
                    ? "border-accent-600/30 bg-accent-50 text-accent-700"
                    : "border-zinc-200/80 text-ink-soft hover:border-zinc-300 " +
                      "hover:bg-zinc-50 hover:text-ink")
                }
              >
                {speaking ? <SpinnerIcon /> : <SpeakerIcon />}
                {speaking ? "Reading aloud…" : "Listen"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SpeakerIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11 5 6 9H3v6h3l5 4V5Z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  );
}

// Spins from the tap until the last sentence has finished playing, so the wait
// while the first clip is synthesised does not look like a dead button.
function SpinnerIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 animate-spin" aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        opacity="0.25"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
