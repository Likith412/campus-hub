// Sonner/Linear-style ring spinner. Inherits color via `currentColor` so it
// adapts to its parent (button text, muted text, accent, etc).
export default function Spinner({ size = 16, strokeWidth = 2, className }) {
   return (
      <svg
         className={`spinner-ring${className ? ` ${className}` : ""}`}
         width={size}
         height={size}
         viewBox="0 0 24 24"
         fill="none"
         aria-hidden="true"
      >
         <circle
            cx="12"
            cy="12"
            r="9"
            stroke="currentColor"
            strokeOpacity="0.18"
            strokeWidth={strokeWidth}
         />
         <path
            d="M21 12a9 9 0 0 0-9-9"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
         />
      </svg>
   );
}

// Centered block — drop-in replacement for "Loading…" empty states.
export function LoadingBlock({ label, size = 22 }) {
   return (
      <div className="loading-block" role="status" aria-live="polite">
         <Spinner size={size} />
         {label && <span className="loading-label">{label}</span>}
      </div>
   );
}
