import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatTurn } from "@client/api/chat";

export function MessageBubble({
  turn,
  index,
  onSpeak,
}: {
  turn: ChatTurn;
  index: number;
  // Absent when voice is not configured, which is also why the control is not
  // rendered at all rather than rendered disabled: an button nobody can use is
  // just an unanswered question about why.
  onSpeak?: () => void;
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
                aria-label="Read this reply aloud"
                title="Read aloud"
                className="mt-2.5 -ml-1.5 flex items-center gap-1.5 rounded-lg border
                  border-zinc-200/80 px-2.5 py-1 text-xs font-medium text-ink-soft
                  transition hover:border-zinc-300 hover:bg-zinc-50 hover:text-ink
                  focus-visible:outline-2 focus-visible:outline-offset-2
                  focus-visible:outline-accent-600"
              >
                <SpeakerIcon />
                Listen
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
