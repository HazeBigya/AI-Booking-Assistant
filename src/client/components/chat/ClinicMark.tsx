// One silhouette, shared with app/icon.svg so the favicon and the in-app mark
// are the same shape. Solid fill stays legible down to 16px.
export function ClinicMark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2.4c1.9 0 2.9.85 4.8.85 2.5 0 4.1 1.8 4.1 4.75 0 3.45-1.35 5.35-2.2 7.95-.65 2.05-.85 5.15-2.75 5.15-1.7 0-1.8-2.65-2.2-4.5-.3-1.6-.65-2.65-1.75-2.65s-1.45 1.05-1.75 2.65c-.4 1.85-.5 4.5-2.2 4.5-1.9 0-2.1-3.1-2.75-5.15C4.55 13.35 3.2 11.45 3.2 8c0-2.95 1.6-4.75 4.1-4.75 1.9 0 2.8-.85 4.7-.85Z"
      />
    </svg>
  );
}
