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

// Deterministic avatar colour from a name or slug — the same person keeps the same
// swatch on every page that draws them.
const AVATAR_COLORS = [
   "#6c63ff",
   "#34d399",
   "#f59e0b",
   "#3b82f6",
   "#ef4444",
   "#a855f7",
   "#06b6d4",
   "#ec4899",
];

export function colorFor(s = "") {
   let h = 0;
   for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
   return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

// "12 Mar 2025" — the absolute form every page falls back to.
export function shortDate(d) {
   if (!d) return "—";
   return new Date(d).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
   });
}

// "3 hr ago" for a table column; `absolute` renders anything older than a week.
export function timeAgo(d, absolute = shortDate) {
   if (!d) return "Never";
   const diff = Date.now() - new Date(d).getTime();
   const m = 60000,
      h = 3600000,
      day = 86400000;
   if (diff < m) return "Just now";
   if (diff < h) return `${Math.floor(diff / m)} min ago`;
   if (diff < day) return `${Math.floor(diff / h)} hr ago`;
   if (diff < 7 * day) return `${Math.floor(diff / day)} days ago`;
   return absolute(d);
}

// Relative age of an announcement, falling back to an absolute date after a week.
// `absolute` is overridable — Settings wants the plain locale date.
export function postedAt(iso, absolute) {
   const diff = Date.now() - new Date(iso).getTime();
   const m = 60000,
      h = 3600000,
      d = 86400000;
   if (diff < m) return "just now";
   if (diff < h) return `${Math.floor(diff / m)}m ago`;
   if (diff < d) return `${Math.floor(diff / h)}h ago`;
   if (diff < 7 * d) return `${Math.floor(diff / d)}d ago`;
   return absolute ? absolute(iso) : shortDate(iso);
}
