import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatTurn } from "@client/api/chat";

export function MessageBubble({
  turn,
  index,
  onSpeak,
  audio = "idle",
}: {
  turn: ChatTurn;
  index: number;
  // Absent when voice is not configured, which is also why the control is not
  // rendered at all rather than rendered disabled: a button nobody can use is
  // just an unanswered question about why. Starts the reading, and stops it
  // again while it is running — a voice you cannot interrupt is a voice you
  // have to sit through.
  onSpeak?: () => void;
  // Three states, not two: `preparing` is the second or two of silence while
  // the first clip is synthesised, and it needs to look different from playing
  // or the button appears to have done nothing. Owned by the voice hook rather
  // than by this component, so a reply spoken through the microphone shows the
  // same thing as one the reader started by pressing Listen.
  audio?: "idle" | "preparing" | "playing";
}) {
  const mine = turn.role === "user";
  const busy = audio !== "idle";

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
                aria-busy={audio === "preparing"}
                aria-label={busy ? "Stop reading this reply" : "Read this reply aloud"}
                title={busy ? "Stop" : "Read aloud"}
                className={
                  "mt-2.5 -ml-1.5 flex items-center gap-1.5 rounded-lg border px-2.5 py-1 " +
                  "text-xs font-medium transition focus-visible:outline-2 " +
                  "focus-visible:outline-offset-2 focus-visible:outline-accent-600 " +
                  (busy
                    ? "border-accent-600/30 bg-accent-50 text-accent-700"
                    : "border-zinc-200/80 text-ink-soft hover:border-zinc-300 " +
                      "hover:bg-zinc-50 hover:text-ink")
                }
              >
                {audio === "preparing" ? (
                  <SpinnerIcon />
                ) : audio === "playing" ? (
                  <StopIcon />
                ) : (
                  <SpeakerIcon />
                )}
                {busy ? "Stop" : "Listen"}
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

// A square, the universal "this is playing, press to end it". Ringed so it
// reads as an active control rather than as a disabled Listen.
function StopIcon() {
  return (
    <span className="grid h-3.5 w-3.5 place-items-center" aria-hidden="true">
      <span className="h-2.5 w-2.5 rounded-[2px] bg-current" />
    </span>
  );
}

// Spins through the wait between pressing Listen and the first sound, which is
// otherwise indistinguishable from a button that did nothing.
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
