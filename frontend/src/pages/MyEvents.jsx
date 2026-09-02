// Everything you've taken a seat at — /my-events, students only. The dashboard shows
// the next handful; this is the full, paginated record, upcoming and past.
import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { eventsApi, ApiError } from "../services";
import { EVENT_TYPE_LABEL } from "../utils/events";
import AppShell from "../components/layout/AppShell";
import Icon from "../components/Icon";
import { LoadingBlock } from "../components/Spinner";
import EventCard from "../components/EventCard";
import Pagination from "../components/Pagination";
import { useToast } from "../contexts/ToastContext";
import { useConfirm } from "../contexts/ConfirmContext";

const PAGE_SIZE = 9;
const TABS = [
   { id: "upcoming", label: "Upcoming" },
   { id: "past", label: "Past" },
];
const SEATS = [
   { id: "", label: "Any seat" },
   { id: "registered", label: "Registered" },
   { id: "waitlisted", label: "Waitlisted" },
];
const SORTS = [
   { id: "soonest", label: "Date · soonest" },
   { id: "latest", label: "Date · latest" },
];

export default function MyEvents() {
   const toast = useToast();
   const confirm = useConfirm();

   // The tab lives in the URL — reloadable, linkable, back-button friendly.
   const [searchParams, setSearchParams] = useSearchParams();
   const urlTab = searchParams.get("tab");
   const when = TABS.some((t) => t.id === urlTab) ? urlTab : TABS[0].id;
   const setWhen = (id) =>
      setSearchParams(id === TABS[0].id ? {} : { tab: id }, { replace: true });

   const [search, setSearch] = useState("");
   const [q, setQ] = useState("");
   const [type, setType] = useState("");
   const [seat, setSeat] = useState("");
   const [sort, setSort] = useState("");
   const [page, setPage] = useState(1);
   const [data, setData] = useState(null);
   const [loadedKey, setLoadedKey] = useState(null);
   const [busyId, setBusyId] = useState(null);
   const [reloadNonce, setReloadNonce] = useState(0);

   const key = `${when}|${q}|${type}|${seat}|${sort}|${page}|${reloadNonce}`;
   const loading = loadedKey !== key;

   useEffect(() => {
      let cancelled = false;
      eventsApi
         .listMyEvents({
            when,
            q: q || undefined,
            type: type || undefined,
            status: seat || undefined,
            sort: sort || undefined,
            page,
            limit: PAGE_SIZE,
         })
         .then((d) => !cancelled && setData(d))
         .catch((err) => {
            if (cancelled) return;
            toast.error(
               err instanceof ApiError ? err.message : "Couldn't load your events",
            );
            setData({ items: [], pagination: { total: 0 } });
         })
         .finally(() => !cancelled && setLoadedKey(key));
      return () => {
         cancelled = true;
      };
   }, [when, q, type, seat, sort, page, key, toast]);

   useEffect(() => {
      const id = setTimeout(() => setQ(search.trim()), 300);
      return () => clearTimeout(id);
   }, [search]);

   // Any filter change restarts paging — page 3 of one filter means nothing under
   // another. Derived during render, the pattern the other list pages use.
   const filters = `${when}|${q}|${type}|${seat}|${sort}`;
   const [prevFilters, setPrevFilters] = useState(filters);
   if (prevFilters !== filters) {
      setPrevFilters(filters);
      setPage(1);
   }

   const unregister = useCallback(
      async (event) => {
         const ok = await confirm({
            title: `Cancel your spot at “${event.title}”?`,
            message: "Your seat goes to the next person on the waitlist.",
            confirmLabel: "Cancel registration",
            danger: true,
         });
         if (!ok) return;
         setBusyId(event.id);
         try {
            await eventsApi.unregisterFromEvent(event.id);
            toast.success("Registration cancelled");
            setReloadNonce((n) => n + 1);
         } catch (err) {
            toast.error(err instanceof ApiError ? err.message : "Couldn't cancel");
         } finally {
            setBusyId(null);
         }
      },
      [confirm, toast],
   );

   const items = data?.items || [];
   const total = data?.pagination?.total ?? 0;
   const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

   return (
      <AppShell title="My Events">
         <div className="main">
            <div className="fac-pagehead">
               <h1 className="fac-page-title">My Events</h1>
               <p className="fac-page-sub">
                  Every event you've registered for. Cancelling frees your seat for
                  whoever is next on the waitlist.
               </p>
            </div>

            <div className="ev-head">
               <div>
                  <div className="panel-title">
                     {total} event{total === 1 ? "" : "s"}
                  </div>
                  <div className="panel-sub">
                     {when === "upcoming" ? "Still to come" : "Already run"}
                  </div>
               </div>
               <div className="tabs">
                  {TABS.map((t) => (
                     <button
                        key={t.id}
                        type="button"
                        className={`tab${when === t.id ? " active" : ""}`}
                        onClick={() => setWhen(t.id)}
                     >
                        {t.label}
                     </button>
                  ))}
               </div>
            </div>

            <div className="fac-toolbar">
               <div className="fac-search">
                  <Icon size={15}>
                     <circle cx="11" cy="11" r="8" />
                     <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </Icon>
                  <input
                     placeholder="Search your events by name…"
                     value={search}
                     onChange={(e) => setSearch(e.target.value)}
                  />
               </div>
               <div className="ac-sort">
                  <span>Type</span>
                  <select
                     value={type}
                     onChange={(e) => setType(e.target.value)}
                     aria-label="Filter by event type"
                  >
                     <option value="">All types</option>
                     {Object.entries(EVENT_TYPE_LABEL).map(([id, label]) => (
                        <option key={id} value={id}>
                           {label}
                        </option>
                     ))}
                  </select>
               </div>
               {/* Your standing on the event, not the event's own status. */}
               <div className="ac-sort">
                  <span>Seat</span>
                  <select
                     value={seat}
                     onChange={(e) => setSeat(e.target.value)}
                     aria-label="Filter by seat"
                  >
                     {SEATS.map((o) => (
                        <option key={o.id} value={o.id}>
                           {o.label}
                        </option>
                     ))}
                  </select>
               </div>
               <div className="ac-sort">
                  <Icon size={13} strokeWidth={2.2}>
                     <line x1="3" y1="6" x2="13" y2="6" />
                     <line x1="3" y1="12" x2="10" y2="12" />
                     <line x1="3" y1="18" x2="7" y2="18" />
                  </Icon>
                  <span>Sort</span>
                  <select
                     value={sort}
                     onChange={(e) => setSort(e.target.value)}
                     aria-label="Sort events"
                  >
                     {/* Blank = the tab's natural order: soonest ahead, latest behind. */}
                     <option value="">Default</option>
                     {SORTS.map((o) => (
                        <option key={o.id} value={o.id}>
                           {o.label}
                        </option>
                     ))}
                  </select>
               </div>
            </div>

            {loading && !data ? (
               <LoadingBlock label="Loading your events" size={24} />
            ) : items.length === 0 ? (
               <div className="pr-blank">
                  <Icon size={22} strokeWidth={1.8}>
                     <rect x="3" y="4" width="18" height="18" rx="2" />
                     <line x1="16" y1="2" x2="16" y2="6" />
                     <line x1="8" y1="2" x2="8" y2="6" />
                     <line x1="3" y1="10" x2="21" y2="10" />
                  </Icon>
                  <span>
                     {q || type || seat
                        ? "No events match those filters."
                        : when === "past"
                          ? "Nothing in your history yet."
                          : "You haven't signed up for anything yet."}
                  </span>
                  {when === "upcoming" && !(q || type || seat) && (
                     <Link to="/explore" className="fac-inline-link">
                        Explore events →
                     </Link>
                  )}
               </div>
            ) : (
               <div className={`event-grid${loading ? " is-refetching" : ""}`}>
                  {items.map((e) => (
                     <EventCard
                        key={e.id}
                        event={e}
                        showClub
                        showStatus
                        busy={busyId === e.id}
                        /* Only onLeave: you're already on every event in this list,
                           so the control gives the seat up rather than taking one. */
                        onLeave={unregister}
                     />
                  ))}
               </div>
            )}

            {totalPages > 1 && (
               <Pagination
                  page={page}
                  totalPages={totalPages}
                  perPage={PAGE_SIZE}
                  hasMore={data?.pagination?.hasMore}
                  onChange={setPage}
               />
            )}
         </div>
      </AppShell>
   );
}
