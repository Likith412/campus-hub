// The clubs you belong to and the ones you follow — /my-clubs, students only.
// /clubs is the browse-everything page; this is only your side of it.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { profileApi, clubsApi, ApiError } from "../services";
import AppShell from "../components/layout/AppShell";
import Icon from "../components/Icon";
import { LoadingBlock } from "../components/Spinner";
import { useToast } from "../contexts/ToastContext";
import { initials } from "../utils/text";
import { CATEGORY_LABEL } from "../utils/clubs";
import SearchField from "../components/SearchField";
import FilterSelect from "../components/FilterSelect";
import { CATEGORY_OPTIONS } from "../utils/clubs";

const TABS = [
   { id: "member", label: "Member" },
   { id: "following", label: "Following" },
];

const SORTS = [
   { id: "recent", label: "Recently joined" },
   { id: "name", label: "Name (A–Z)" },
   { id: "members", label: "Most members" },
];

export default function MyClubs() {
   const toast = useToast();
   // The tab lives in the URL, not in state — so it survives a reload, can be
   // linked to, and the back button steps through it.
   const [searchParams, setSearchParams] = useSearchParams();
   const urlTab = searchParams.get("tab");
   const relation = TABS.some((t) => t.id === urlTab) ? urlTab : TABS[0].id;
   const setRelation = (id) =>
      // The default tab needs no param — keeps /my-clubs clean.
      setSearchParams(id === TABS[0].id ? {} : { tab: id }, { replace: true });

   // Filtering happens in the browser on purpose: this endpoint returns every club
   // you're in — a handful, unpaginated — so a round trip per keystroke would buy
   // nothing. My Events filters server-side because that list is paginated.
   const [search, setSearch] = useState("");
   const [category, setCategory] = useState("");
   const [sort, setSort] = useState("recent");

   const [data, setData] = useState(null);
   const [loadedKey, setLoadedKey] = useState(null);
   const [busySlug, setBusySlug] = useState(null);
   const [reloadNonce, setReloadNonce] = useState(0);

   const key = `${relation}|${reloadNonce}`;
   const loading = loadedKey !== key;

   useEffect(() => {
      let cancelled = false;
      profileApi
         .getClubs({ relation })
         .then((d) => !cancelled && setData(d))
         .catch((err) => {
            if (cancelled) return;
            toast.error(
               err instanceof ApiError ? err.message : "Couldn't load your clubs",
            );
            setData({ items: [] });
         })
         .finally(() => !cancelled && setLoadedKey(key));
      return () => {
         cancelled = true;
      };
   }, [relation, key, toast]);

   const unfollow = useCallback(
      async (club) => {
         setBusySlug(club.slug);
         try {
            await clubsApi.unfollowClub(club.slug);
            toast.success(`Unfollowed ${club.name}`);
            setReloadNonce((n) => n + 1);
         } catch (err) {
            toast.error(
               err instanceof ApiError ? err.message : "Couldn't unfollow",
            );
         } finally {
            setBusySlug(null);
         }
      },
      [toast],
   );

   const all = useMemo(() => data?.items || [], [data]);

   const items = useMemo(() => {
      const q = search.trim().toLowerCase();
      const rows = all.filter(
         (c) =>
            (!category || c.category === category) &&
            (!q ||
               c.name.toLowerCase().includes(q) ||
               (c.tagline || "").toLowerCase().includes(q)),
      );
      const at = (c) => new Date(c.joinedAt || c.followedAt || 0).getTime();
      return [...rows].sort((a, b) => {
         if (sort === "name") return a.name.localeCompare(b.name);
         if (sort === "members") return b.memberCount - a.memberCount;
         return at(b) - at(a);
      });
   }, [all, search, category, sort]);

   const filtering = !!(search.trim() || category);

   return (
      <AppShell title="My Clubs">
         <div className="main">
            <div className="fac-pagehead">
               <h1 className="fac-page-title">My Clubs</h1>
               <p className="fac-page-sub">
                  Clubs you've joined, and the ones you follow for their public
                  announcements.{" "}
                  <Link to="/clubs" className="fac-inline-link">
                     Browse every club →
                  </Link>
               </p>
            </div>

            <div className="ev-head">
               <div>
                  <div className="panel-title">
                     {items.length} club{items.length === 1 ? "" : "s"}
                     {filtering && all.length !== items.length
                        ? ` of ${all.length}`
                        : ""}
                  </div>
                  <div className="panel-sub">
                     {relation === "member"
                        ? "Where you hold a membership"
                        : "Following for announcements only"}
                  </div>
               </div>
               <div className="tabs">
                  {TABS.map((t) => (
                     <button
                        key={t.id}
                        type="button"
                        className={`tab${relation === t.id ? " active" : ""}`}
                        onClick={() => setRelation(t.id)}
                     >
                        {t.label}
                     </button>
                  ))}
               </div>
            </div>

            <div className="fac-toolbar">
               <SearchField
                  placeholder="Search your clubs…"
                  value={search}
                  onChange={setSearch}
               />
               <FilterSelect
                  label="Category"
                  value={category}
                  onChange={setCategory}
                  options={CATEGORY_OPTIONS}
                  allLabel="All categories"
                  ariaLabel="Filter by category"
               />
               <FilterSelect
                  label="Sort"
                  value={sort}
                  onChange={setSort}
                  options={SORTS}
                  ariaLabel="Sort clubs"
                  withIcon
               />
            </div>

            {loading && !data ? (
               <LoadingBlock label="Loading your clubs" size={24} />
            ) : items.length === 0 ? (
               <div className="pr-blank">
                  <Icon size={22} strokeWidth={1.8}>
                     <rect x="2" y="7" width="20" height="14" rx="2" />
                     <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                  </Icon>
                  <span>
                     {filtering
                        ? "No clubs match those filters."
                        : relation === "member"
                          ? "You haven't joined any club yet."
                          : "You're not following any club yet."}
                  </span>
                  {!filtering && (
                     <Link to="/clubs" className="fac-inline-link">
                        Find a club →
                     </Link>
                  )}
               </div>
            ) : (
               <div className={`mc-grid${loading ? " is-refetching" : ""}`}>
                  {items.map((c) => (
                     <div key={c.clubId} className="mc-card">
                        <Link to={`/clubs/${c.slug}`} className="mc-top">
                           <div
                              className="mc-logo"
                              style={{
                                 background: `linear-gradient(135deg, ${c.coverFrom || "#6366f1"}, ${c.coverTo || "#a78bfa"})`,
                              }}
                           >
                              {initials(c.name)}
                           </div>
                           <div className="mc-body">
                              <div className="mc-name">
                                 {c.name}
                                 {c.verified && (
                                    <span
                                       className="verified-tick sm"
                                       title="Verified club"
                                    >
                                       <Icon size={9} strokeWidth={3.5}>
                                          <polyline points="20 6 9 17 4 12" />
                                       </Icon>
                                    </span>
                                 )}
                              </div>
                              <div className="mc-meta">
                                 <span>
                                    {CATEGORY_LABEL[c.category] || c.category}
                                 </span>
                                 <span>
                                    {c.memberCount} member
                                    {c.memberCount === 1 ? "" : "s"}
                                 </span>
                              </div>
                              {c.tagline && (
                                 <div className="mc-tagline">{c.tagline}</div>
                              )}
                           </div>
                        </Link>
                        <div className="mc-foot">
                           {c.relation === "member" ? (
                              <span
                                 className={`role-tag${c.role === "coordinator" || c.role === "president" ? " admin" : ""}`}
                              >
                                 {c.roleName || c.role || "member"}
                              </span>
                           ) : (
                              <span className="mc-follow-tag">Following</span>
                           )}
                           <div className="mc-actions">
                              <Link
                                 className="btn-mini"
                                 to={`/clubs/${c.slug}/announcements`}
                              >
                                 Announcements
                              </Link>
                              {c.relation === "following" && (
                                 <button
                                    type="button"
                                    className="btn-mini danger"
                                    disabled={busySlug === c.slug}
                                    onClick={() => unfollow(c)}
                                 >
                                    {busySlug === c.slug ? "…" : "Unfollow"}
                                 </button>
                              )}
                           </div>
                        </div>
                     </div>
                  ))}
               </div>
            )}
         </div>
      </AppShell>
   );
}
