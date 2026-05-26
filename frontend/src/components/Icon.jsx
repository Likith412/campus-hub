// Inline SVG wrapper. `paths` is JSX (one or more <path/>, <circle/>, etc).
export default function Icon({ size = 16, strokeWidth = 2, children, className }) {
   return (
      <svg
         className={className}
         width={size}
         height={size}
         viewBox="0 0 24 24"
         fill="none"
         stroke="currentColor"
         strokeWidth={strokeWidth}
         strokeLinecap="round"
         strokeLinejoin="round"
      >
         {children}
      </svg>
   );
}
