// Two-letter monogram for an avatar or club badge. Honorifics are dropped so
// "Dr. Priya Nair" reads PN, not DP.
export function initials(name = "") {
   return (
      (name || "")
         .replace(/^(Dr|Prof|Mr|Ms|Mrs)\.?\s+/i, "")
         .trim()
         .split(/\s+/)
         .map((w) => w[0])
         .slice(0, 2)
         .join("")
         .toUpperCase() || "?"
   );
}
