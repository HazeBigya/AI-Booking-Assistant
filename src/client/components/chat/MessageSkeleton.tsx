import { memo } from "react";

// Skeletal, not a spinner: the shape tells you what is arriving.
export const MessageSkeleton = memo(function MessageSkeleton() {
  return (
    <div className="max-w-[78%] space-y-2 rounded-2xl rounded-bl-md border border-zinc-200/70 bg-white p-4 shadow-diffuse">
      {["w-11/12", "w-4/5", "w-2/3"].map((w) => (
        <div key={w} className={`relative h-3 overflow-hidden rounded-full bg-zinc-100 ${w}`}>
          <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white to-transparent" />
        </div>
      ))}
    </div>
  );
});
