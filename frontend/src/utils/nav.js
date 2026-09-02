// Where a shared destination lives for each platform role.
// /clubs is a student-only route and /admin/clubs is superAdmin-only, so any in-page
// link to "clubs" has to resolve per viewer or it bounces them through ProtectedRoute.

// The clubs *listing*. Faculty have none — they move between clubs with the switcher —
// so this returns null and callers render plain text instead of a dead link.
export function clubsListHref(role) {
   if (role === "superAdmin") return "/admin/clubs";
   if (role === "student") return "/clubs";
   return null;
}

// The same destination as a breadcrumb: label included, since a superAdmin lands on a
// page called "All Clubs". `to: null` means render plain text — faculty have no listing.
export function clubsListCrumb(role) {
   if (role === "superAdmin") return { to: "/admin/clubs", label: "All Clubs" };
   if (role === "student") return { to: "/clubs", label: "Clubs" };
   return { to: null, label: "Clubs" };
}

// A single club. A superAdmin manages one from the admin surface; everyone else uses
// its public page.
export function clubHref(role, slug) {
   return role === "superAdmin"
      ? `/admin/clubs/${slug}`
      : `/clubs/${slug}`;
}

// Anyone's profile page. Prefers the username so shared links stay readable, and
// falls back to the id for accounts that never picked one. Returns null when there
// is no account to point at (e.g. a removed member's row) — render plain text then.
export function profileHref(user) {
   const handle = user?.username || user?.id || user?._id || user?.userId;
   return handle ? `/u/${handle}` : null;
}
