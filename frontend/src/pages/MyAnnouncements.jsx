// Announcements — /announcements, opened from the topbar bell. The cross-club digest:
// everything posted by clubs you're a member of, plus the public notices from clubs you
// follow. Read-only; pinning and deleting live on each club's own board.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { announcementsApi, errMessage } from "../services";
import AppShell from "../components/layout/AppShell";
import Icon from "../components/Icon";
import { LoadingBlock } from "../components/Spinner";
import SearchField from "../components/SearchField";
import FilterSelect from "../components/FilterSelect";
import Pagination from "../components/Pagination";
import { PAGE_SIZE_OPTIONS } from "../utils/pagination";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import useDebounced from "../hooks/useDebounced";
import useLatestRequest from "../hooks/useLatestRequest";
import { initials, postedAt } from "../utils/text";
import { clubHref, profileHref } from "../utils/nav";
import { markSeen } from "../utils/announcementsSeen";

// Where the notice reached you from — the two streams the digest merges.
const SOURCE_TABS = [
   { id: "", label: "All" },
   { id: "member", label: "My clubs" },
   { id: "following", label: "Following" },
];

const VIS_FILTERS = [
   { id: "public", label: "Everyone" },
   { id: "private", label: "Members only" },
];

const SORTS = [
   { id: "newest", label: "Newest first" },
   { id: "oldest", label: "Oldest first" },
];


export default function MyAnnouncements() {
   const { user } = useAuth();
   const toast = useToast();
   const startRequest = useLatestRequest();

   const [search, setSearch] = useState("");
   const debounced = useDebounced(search.trim());
   const [source, setSource] = useState("");
   const [vis, setVis] = useState("");
   const [club, setClub] = useState("");
   const [sort, setSort] = useState("newest");
   const [page, setPage] = useState(1);
   const [perPage, setPerPage] = useState(PAGE_SIZE_OPTIONS[0]);
   const [data, setData] = useState(null);
   const [loadedKey, setLoadedKey] = useState(null);

   const filterKey = `${debounced}|${source}|${vis}|${club}|${sort}`;
   const isUnfiltered =
      !debounced && !source && !vis && !club && sort === "newest";
   const currentKey = `${filterKey}|${page}|${perPage}`;
   const loading = loadedKey !== currentKey;

   // Reset to page 1 when the filters change
   const [prevFilters, setPrevFilters] = useState(filterKey);
   if (prevFilters !== filterKey) {
      setPrevFilters(filterKey);
      setPage(1);
   }

   const load = useCallback(() => {
      const isCurrent = startRequest();
      const myKey = `${filterKey}|${page}|${perPage}`;
      announcementsApi
         .listMyAnnouncements({
            q: debounced || undefined,
            visibility: vis || undefined,
            club: club || undefined,
            source: source || undefined,
            sort,
            // Only this page renders the club filter, so only this page asks for its options.
            withClubs: "true",
            page,
            limit: perPage,
         })
         .then((d) => {
            if (!isCurrent()) return;
            setData(d);
            // Opening the unfiltered digest clears the bell's dot up to the newest
            // notice. A filtered view's first row isn't the newest one overall.
            if (page === 1 && isUnfiltered)
               markSeen(user?.id, d?.items?.[0]?.createdAt);
         })
         .catch((err) => {
            if (!isCurrent()) return;
            toast.error(
               errMessage(err, "Couldn't load announcements"),
            );
            setData({ items: [], pagination: { total: 0 } });
         })
         .finally(() => isCurrent() && setLoadedKey(myKey));
   }, [
      filterKey,
      isUnfiltered,
      debounced,
      vis,
      club,
      source,
      sort,
      page,
      perPage,
      toast,
      startRequest,
      user?.id,
   ]);

   useEffect(() => {
      load();
   }, [load]);

   const items = data?.items || [];
   const clubs = data?.clubs || [];
   const total = data?.pagination?.total ?? 0;
   const totalPages = Math.max(1, Math.ceil(total / perPage));

   // A mutation can empty the page you're on (cancel the only row on the last page).
   // Without this the list renders its "nothing here" copy and the pager unmounts,
   // leaving no way back to page 1.
   if (!loading && page > totalPages) setPage(totalPages);

   return (
      <AppShell title="Announcements">
         <div className="main my-announcements">
            <div className="page-header">
               <div>
                  <h1 className="page-title">Announcements</h1>
                  <div className="page-sub">
                     Everything from the clubs you're in, plus the public notices
                     from clubs you follow. Newest first.
                  </div>
               </div>
            </div>

            <div className="fac-toolbar">
               <SearchField
                  placeholder="Search announcements…"
                  value={search}
                  onChange={setSearch}
               />
               <select
                  className="ac-select"
                  value={club}
                  onChange={(e) => setClub(e.target.value)}
                  aria-label="Filter by club"
               >
                  <option value="">All clubs</option>
                  {clubs.map((c) => (
                     <option key={c.slug} value={c.slug}>
                        {c.name}
                     </option>
                  ))}
               </select>
               <select
                  className="ac-select"
                  value={vis}
                  onChange={(e) => setVis(e.target.value)}
                  aria-label="Filter by visibility"
               >
                  <option value="">Any visibility</option>
                  {VIS_FILTERS.map((f) => (
                     <option key={f.id} value={f.id}>
                        {f.label}
                     </option>
                  ))}
               </select>
               <FilterSelect
                  label="Sort"
                  value={sort}
                  onChange={setSort}
                  options={SORTS}
                  ariaLabel="Sort announcements"
                  withIcon
               />
            </div>

            <div className="ev-head">
               <div>
                  <div className="panel-title">
                     {total} announcement{total === 1 ? "" : "s"}
                  </div>
                  <div className="panel-sub">
                     Open a club's board to pin or reply to its notices
                  </div>
               </div>
               {/* Which stream a notice came through — membership or a plain follow. */}
               <div className="tabs">
                  {SOURCE_TABS.map((t) => (
                     <button
                        key={t.id || "all"}
                        type="button"
                        className={`tab${source === t.id ? " active" : ""}`}
                        onClick={() => setSource(t.id)}
                     >
                        {t.label}
                     </button>
                  ))}
               </div>
            </div>

            {loading && !data ? (
               <LoadingBlock label="Loading announcements" size={24} />
            ) : items.length === 0 ? (
               <div className="ev-empty">
                  {isUnfiltered
                     ? "Nothing yet. Join or follow a club and its notices land here."
                     : "No announcements match those filters."}
               </div>
            ) : (
               <div className={`an-list${loading ? " is-refetching" : ""}`}>
                  {items.map((a) => (
                     <article key={a.id} className="an-card">
                        <div className="an-card-head">
                           <div className="an-avatar">
                              {initials(a.author?.name)}
                           </div>
                           <div className="an-byline">
                              <div className="an-title">{a.title}</div>
                              <div className="an-meta">
                                 {/* Which club sent it — the thing that matters most here. */}
                                 <Link to={clubHref(user?.role, a.club?.slug)}>
                                    {a.club?.name || "Unknown club"}
                                 </Link>
                                 <span className="sep">·</span>
                                 <span
                                    className={`an-vis-tag ${a.visibility}`}
                                    title={
                                       a.visibility === "public"
                                          ? "Anyone can read this"
                                          : "Club members only"
                                    }
                                 >
                                    {a.visibility === "public"
                                       ? "Everyone"
                                       : "Members only"}
                                 </span>
                                 <span className="sep">·</span>
                                 {a.author ? (
                                    <Link
                                       to={profileHref({ id: a.author.id })}
                                       className="pr-name-link"
                                    >
                                       {a.author.name}
                                    </Link>
                                 ) : (
                                    "Unknown"
                                 )}
                                 <span className="sep">·</span>
                                 {postedAt(a.createdAt)}
                              </div>
                           </div>
                           <div className="an-actions">
                              {/* The club page's announcements tab — the board at
                                  /clubs/:slug/announcements is for posting, and a
                                  student with no club role can't open it. */}
                              <Link
                                 className="btn-mini"
                                 to={`${clubHref(user?.role, a.club?.slug)}?tab=announcements`}
                              >
                                 Open club
                              </Link>
                           </div>
                        </div>
                        <div className="an-body">{a.body}</div>
                        {a.event && (
                           <Link
                              className="an-event-chip"
                              to={`/events/${a.event.id}`}
                           >
                              <Icon size={12} strokeWidth={2.2}>
                                 <rect x="3" y="4" width="18" height="18" rx="2" />
                                 <line x1="16" y1="2" x2="16" y2="6" />
                                 <line x1="8" y1="2" x2="8" y2="6" />
                                 <line x1="3" y1="10" x2="21" y2="10" />
                              </Icon>
                              {a.event.title}
                           </Link>
                        )}
                     </article>
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
