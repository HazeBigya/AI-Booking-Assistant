import { memo } from "react";

// Memoised and isolated: the infinite animation must never re-render the list.
export const TypingIndicator = memo(function TypingIndicator() {
  return (
    <div className="flex items-center gap-3" aria-live="polite" aria-label="Assistant is replying">
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-zinc-200/70 bg-white px-4 py-3 shadow-diffuse">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-breathe rounded-full bg-ink-faint"
            style={{ animationDelay: `${i * 160}ms` }}
          />
        ))}
      </div>
    </div>
  );
});
