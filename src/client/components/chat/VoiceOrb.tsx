"use client";

import { memo } from "react";
import type { ConversationState } from "./types";

const BAR_HEIGHTS = ["h-2", "h-4", "h-6", "h-4", "h-2"];

// The single place voice activity is drawn. Bars animate on transform only, so
// the loop stays on the compositor. Levels are decorative until the audio
// pipeline lands; swapping in real amplitude means scaling these same bars.
export const VoiceOrb = memo(function VoiceOrb({
  state,
  className = "",
}: {
  state: ConversationState;
  className?: string;
}) {
  const active = state === "listening" || state === "speaking";
  const tint = state === "listening" ? "bg-accent-600" : "bg-ink";

  return (
    <span className={`relative inline-flex items-center gap-[3px] ${className}`} aria-hidden="true">
      {active && (
        <span className="absolute inset-0 -z-10 animate-halo rounded-full bg-accent-400/25" />
      )}
      {BAR_HEIGHTS.map((h, i) => (
        <span
          key={i}
          className={`w-[3px] origin-center rounded-full transition-colors duration-300 ease-glide ${h} ${
            active ? `${tint} animate-bar` : "h-1.5 bg-ink-faint"
          }`}
          style={active ? { animationDelay: `${i * 110}ms` } : undefined}
        />
      ))}
    </span>
  );
});
