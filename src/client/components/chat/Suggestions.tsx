"use client";

// Shown only on an empty conversation: an empty state that says how to fill it.
const PROMPTS = [
  "What services do you offer?",
  "Who is best for a root canal?",
  "Book a checkup on Monday morning",
  "Show my appointments",
];

export function Suggestions({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="stagger flex flex-wrap gap-2">
      {PROMPTS.map((p, i) => (
        <button
          key={p}
          type="button"
          onClick={() => onPick(p)}
          style={{ "--index": i } as React.CSSProperties}
          className="rounded-full border border-zinc-200 bg-white px-3.5 py-2 text-sm text-ink-soft
            shadow-inset transition duration-300 ease-glide hover:-translate-y-px hover:border-zinc-300
            hover:text-ink active:translate-y-0 active:scale-[0.98]"
        >
          {p}
        </button>
      ))}
    </div>
  );
}
