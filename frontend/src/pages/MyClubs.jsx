// The clubs you belong to and the ones you follow — /my-clubs, students only.
// /clubs is the browse-everything page; this is only your side of it.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { profileApi, clubsApi, errMessage } from "../services";
import AppShell from "../components/layout/AppShell";
import Icon from "../components/Icon";
import { LoadingBlock } from "../components/Spinner";
import { useToast } from "../contexts/ToastContext";
import { initials } from "../utils/text";
import { CATEGORY_LABEL, CATEGORY_OPTIONS } from "../utils/clubs";
import SearchField from "../components/SearchField";
import FilterSelect from "../components/FilterSelect";
import Pagination from "../components/Pagination";
import { PAGE_SIZE_OPTIONS } from "../utils/pagination";
import useDebounced from "../hooks/useDebounced";

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

   // The list is paged, so search/category/sort run server-side — filtering in the
   // browser would only ever narrow the page you happen to be looking at.
   const [search, setSearch] = useState("");
   const debounced = useDebounced(search.trim());
   const [category, setCategory] = useState("");
   const [sort, setSort] = useState("recent");
   const [page, setPage] = useState(1);
   const [perPage, setPerPage] = useState(PAGE_SIZE_OPTIONS[0]);

   const [data, setData] = useState(null);
   const [loadedKey, setLoadedKey] = useState(null);
   const [busySlug, setBusySlug] = useState(null);
   const [reloadNonce, setReloadNonce] = useState(0);

   const filterKey = `${relation}|${debounced}|${category}|${sort}`;
   const key = `${filterKey}|${page}|${perPage}|${reloadNonce}`;
   const loading = loadedKey !== key;

   // Reset to page 1 when the filters or the tab change
   const [prevFilters, setPrevFilters] = useState(filterKey);
   if (prevFilters !== filterKey) {
      setPrevFilters(filterKey);
      setPage(1);
   }

   useEffect(() => {
      let cancelled = false;
      profileApi
         .getClubs({
            relation,
            q: debounced || undefined,
            category: category || undefined,
            sort,
            page,
            limit: perPage,
         })
         .then((d) => !cancelled && setData(d))
         .catch((err) => {
            if (cancelled) return;
            toast.error(
               errMessage(err, "Couldn't load your clubs"),
            );
            setData({ items: [] });
         })
         .finally(() => !cancelled && setLoadedKey(key));
      return () => {
         cancelled = true;
      };
   }, [relation, debounced, category, sort, page, perPage, key, toast]);

   const unfollow = useCallback(
      async (club) => {
         setBusySlug(club.slug);
         try {
            await clubsApi.unfollowClub(club.slug);
            toast.success(`Unfollowed ${club.name}`);
            setReloadNonce((n) => n + 1);
         } catch (err) {
            toast.error(
               errMessage(err, "Couldn't unfollow"),
            );
         } finally {
            setBusySlug(null);
         }
      },
      [toast],
   );

   const items = useMemo(() => data?.items || [], [data]);
   const total = data?.pagination?.total ?? items.length;
   const totalPages = Math.max(1, Math.ceil(total / perPage));

   // A mutation can empty the page you're on (cancel the only row on the last page).
   // Without this the list renders its "nothing here" copy and the pager unmounts,
   // leaving no way back to page 1.
   if (!loading && page > totalPages) setPage(totalPages);

   const filtering = !!(debounced || category);

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
                     {total} club{total === 1 ? "" : "s"}
                     {filtering ? " matching" : ""}
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
                                 {c.relation === "member" ? (
                                    <span
                                       className={`role-tag${c.role === "coordinator" || c.role === "president" ? " admin" : ""}`}
                                    >
                                       {c.roleName || c.role || "member"}
                                    </span>
                                 ) : (
                                    <span className="mc-follow-tag">
                                       Following
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
                        {c.relation === "following" && (
                           <div className="mc-foot">
                              <div className="mc-actions">
                                 <button
                                    type="button"
                                    className="btn-mini danger"
                                    disabled={busySlug === c.slug}
                                    onClick={() => unfollow(c)}
                                 >
                                    {busySlug === c.slug ? "…" : "Unfollow"}
                                 </button>
                              </div>
                           </div>
                        )}
                     </div>
                  ))}
               </div>
            )}

            {items.length > 0 && (
               <Pagination
                  page={page}
                  totalPages={totalPages}
                  perPage={perPage}
                  perPageOptions={PAGE_SIZE_OPTIONS}
                  onPerPageChange={(n) => {
                     setPerPage(n);
                     setPage(1);
                  }}
                  hasMore={data?.pagination?.hasMore}
                  onChange={setPage}
               />
            )}
         </div>
      </AppShell>
   );
}
