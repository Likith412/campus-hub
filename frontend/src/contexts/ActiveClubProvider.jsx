import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router";
import { profileApi, ApiError } from "../services";
import { useAuth } from "./AuthContext";
import { ActiveClubContext } from "./ActiveClubContext";
import BootScreen from "../components/BootScreen";

// Remember the faculty's last-focused club across reloads, keyed per user.
const storageKey = (user) =>
   `campushub:activeClub:${user?.id || user?._id || user?.email || "anon"}`;

// How long the branded splash overlays the app while switching clubs.
const SWITCH_MS = 2000;

// Any /clubs/<slug>/... URL names the club the page is about.
function slugFromPath(pathname) {
   const m = /^\/clubs\/([^/]+)/.exec(pathname);
   const slug = m?.[1];
   // "new" is the creation wizard, not a club.
   return slug && slug !== "new" ? slug : null;
}

export function ActiveClubProvider({ children }) {
   const { user } = useAuth();
   const { pathname } = useLocation();
   const isFaculty = user?.role === "faculty";

   const [clubs, setClubs] = useState([]);
   const [activeSlug, setActiveSlugState] = useState(null);
   // Derive loading from "have we finished the first fetch yet" — avoids a
   // synchronous setState inside the load effect (and refreshes don't flicker).
   const [loaded, setLoaded] = useState(false);
   const loading = isFaculty && !loaded;
   // Overlays the branded splash for a beat while switching the focused club.
   const [switching, setSwitching] = useState(false);

   const persist = useCallback(
      (slug) => {
         setActiveSlugState(slug);
         try {
            if (slug) localStorage.setItem(storageKey(user), slug);
         } catch {
            // Private mode / storage disabled — switcher still works in-memory.
         }
      },
      [user],
   );

   // `preferred` lets a caller (e.g. just-created a club) request which club ends up in focus.
   const fetchClubs = useCallback(
      async (preferred) => {
         try {
            const data = await profileApi.getClubs();
            // Only the clubs this faculty actually runs (per-club coordinator role).
            const coordinated = (data?.items || [])
               .filter((c) => c.role === "coordinator")
               .sort((a, b) => a.name.localeCompare(b.name));
            setClubs(coordinated);

            const has = (slug) =>
               slug && coordinated.some((c) => c.slug === slug);
            let stored = null;
            try {
               stored = localStorage.getItem(storageKey(user));
            } catch {
               stored = null;
            }
            // Prefer an explicit request, then the saved focus, then the first club.
            const next =
               (has(preferred) && preferred) ||
               (has(stored) && stored) ||
               coordinated[0]?.slug ||
               null;
            persist(next);
         } catch (err) {
            if (!(err instanceof ApiError) || err.status !== 401) {
               console.error("active-club load failed:", err);
            }
            setClubs([]);
         } finally {
            setLoaded(true);
         }
      },
      [user, persist],
   );

   // Load the faculty's clubs once per session. setState only runs after the
   // awaited fetch, so this stays clear of the no-sync-setState-in-effect rule.
   useEffect(() => {
      if (!isFaculty) return;
      (async () => {
         await fetchClubs();
      })();
   }, [isFaculty, fetchClubs]);

   // Manual refetch (e.g. after creating a club). Not an effect, so a loading
   // reset here is fine — but we keep showing the current club to avoid flicker.
   const refresh = useCallback(
      (preferred) => (isFaculty ? fetchClubs(preferred) : Promise.resolve()),
      [isFaculty, fetchClubs],
   );

   // Switch focus; ignore slugs that aren't clubs this faculty runs.
   // A real change flips on the splash for a beat (cleared by the effect below).
   const setActiveSlug = useCallback(
      (slug) => {
         if (slug === activeSlug || !clubs.some((c) => c.slug === slug)) return;
         setSwitching(true);
         persist(slug);
      },
      [clubs, activeSlug, persist],
   );

   // Clear the switch splash after its dwell. Timer lives in a callback, not the
   // effect body, so it stays clear of the no-sync-setState-in-effect rule.
   useEffect(() => {
      if (!switching) return;
      const id = setTimeout(() => setSwitching(false), SWITCH_MS);
      return () => clearTimeout(id);
   }, [switching]);

   // Keep focus in step with the URL. Landing on one of your clubs' pages — from a
   // link, a bookmark, or the address bar — should move the sidebar with you, or the
   // nav ends up pointing at a different club than the page you're reading. Slugs you
   // don't coordinate are ignored, so this can't hand anyone access they lack; the
   // API decides that, and it already refuses.
   //
   // Derived during render (not in an effect) so the sidebar never paints a frame
   // scoped to the previous club, and without the switch splash — you're already
   // looking at the page, so there's nothing to cover.
   // The `urlSlug !== activeSlug` check is what stops this looping: the moment it
   // persists, the two agree and the branch goes quiet.
   const urlSlug = isFaculty ? slugFromPath(pathname) : null;
   if (
      urlSlug &&
      urlSlug !== activeSlug &&
      clubs.some((c) => c.slug === urlSlug)
   ) {
      persist(urlSlug);
   }

   const activeClub = useMemo(
      () => clubs.find((c) => c.slug === activeSlug) || null,
      [clubs, activeSlug],
   );

   const value = useMemo(
      () => ({
         isFaculty,
         clubs,
         activeClub,
         activeSlug,
         setActiveSlug,
         loading,
         refresh,
      }),
      [
         isFaculty,
         clubs,
         activeClub,
         activeSlug,
         setActiveSlug,
         loading,
         refresh,
      ],
   );

   return (
      <ActiveClubContext.Provider value={value}>
         {children}
         {switching && <BootScreen label="Loading your club…" />}
      </ActiveClubContext.Provider>
   );
}
