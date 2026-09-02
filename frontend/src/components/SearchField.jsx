import Icon from "./Icon";

// The search box every list page uses. `className` adds a page-specific modifier
// alongside the shared .fac-search styling.
export default function SearchField({
   value,
   onChange,
   placeholder = "Search…",
   className = "",
   ariaLabel,
}) {
   return (
      <div className={`fac-search${className ? ` ${className}` : ""}`}>
         <Icon size={15}>
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
         </Icon>
         <input
            placeholder={placeholder}
            aria-label={ariaLabel || placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
         />
      </div>
   );
}
