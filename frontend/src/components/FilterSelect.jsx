import Icon from "./Icon";

// A labelled dropdown in a list page's toolbar. `options` is [{ id, label }];
// `withIcon` adds the sort glyph the Sort dropdowns carry, and `allLabel` prepends the
// blank "everything" choice.
export default function FilterSelect({
   label,
   value,
   onChange,
   options,
   ariaLabel,
   allLabel,
   withIcon = false,
}) {
   return (
      <div className="ac-sort">
         {withIcon && (
            <Icon size={13} strokeWidth={2.2}>
               <line x1="3" y1="6" x2="13" y2="6" />
               <line x1="3" y1="12" x2="10" y2="12" />
               <line x1="3" y1="18" x2="7" y2="18" />
            </Icon>
         )}
         <span>{label}</span>
         <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-label={ariaLabel || label}
         >
            {allLabel && <option value="">{allLabel}</option>}
            {options.map((o) => (
               <option key={o.id} value={o.id}>
                  {o.label}
               </option>
            ))}
         </select>
      </div>
   );
}
