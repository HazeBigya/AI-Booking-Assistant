import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatTurn } from "@client/api/chat";

export function MessageBubble({ turn, index }: { turn: ChatTurn; index: number }) {
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
          <div
            className="prose prose-sm max-w-none overflow-x-auto text-ink
              prose-p:my-1.5 prose-headings:font-medium prose-headings:tracking-tight
              prose-strong:text-ink prose-table:my-3 prose-table:text-sm
              prose-th:font-medium prose-th:text-ink-soft prose-td:py-1.5
              prose-li:my-0.5 prose-a:text-accent-700"
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{turn.content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
