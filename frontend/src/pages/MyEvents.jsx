// Everything you've taken a seat at — /my-events, students only. The dashboard shows
// the next handful; this is the full, paginated record, upcoming and past.
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { eventsApi, errMessage } from "../services";
import AppShell from "../components/layout/AppShell";
import Icon from "../components/Icon";
import { LoadingBlock } from "../components/Spinner";
import EventCard from "../components/EventCard";
import Pagination from "../components/Pagination";
import { PAGE_SIZE_OPTIONS } from "../utils/pagination";
import { useToast } from "../contexts/ToastContext";
import useDebounced from "../hooks/useDebounced";
import useEventActions from "../hooks/useEventActions";
import EditEventModal from "../components/EditEventModal";
import SearchField from "../components/SearchField";
import FilterSelect from "../components/FilterSelect";
import { EVENT_TYPE_OPTIONS } from "../utils/events";

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

   // The tab lives in the URL — reloadable, linkable, back-button friendly.
   const [searchParams, setSearchParams] = useSearchParams();
   const urlTab = searchParams.get("tab");
   const when = TABS.some((t) => t.id === urlTab) ? urlTab : TABS[0].id;
   const setWhen = (id) =>
      setSearchParams(id === TABS[0].id ? {} : { tab: id }, { replace: true });

   const [search, setSearch] = useState("");
   const q = useDebounced(search.trim());
   const [type, setType] = useState("");
   const [seat, setSeat] = useState("");
   const [sort, setSort] = useState("");
   const [page, setPage] = useState(1);
   const [perPage, setPerPage] = useState(PAGE_SIZE_OPTIONS[0]);
   const [data, setData] = useState(null);
   const [loadedKey, setLoadedKey] = useState(null);
   const [reloadNonce, setReloadNonce] = useState(0);
   const reload = () => setReloadNonce((n) => n + 1);

   const key = `${when}|${q}|${type}|${seat}|${sort}|${page}|${perPage}|${reloadNonce}`;
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
            limit: perPage,
         })
         .then((d) => !cancelled && setData(d))
         .catch((err) => {
            if (cancelled) return;
            toast.error(
               errMessage(err, "Couldn't load your events"),
            );
            setData({ items: [], pagination: { total: 0 } });
         })
         .finally(() => !cancelled && setLoadedKey(key));
      return () => {
         cancelled = true;
      };
   }, [when, q, type, seat, sort, page, perPage, key, toast]);


   // Any filter change restarts paging — page 3 of one filter means nothing under
   // another. Derived during render, the pattern the other list pages use.
   const filters = `${when}|${q}|${type}|${seat}|${sort}`;
   const [prevFilters, setPrevFilters] = useState(filters);
   if (prevFilters !== filters) {
      setPrevFilters(filters);
      setPage(1);
   }

   const items = data?.items || [];
   // A student who runs a club sees their own club's events here too, and can act on
   // them without leaving the page.
   const {
      editing,
      setEditing,
      busyId: manageBusyId,
      openEditor,
      leaveEvent,
      publishEvent,
      cancelEvent,
   } = useEventActions(reload);
   const total = data?.pagination?.total ?? 0;
   const totalPages = Math.max(1, Math.ceil(total / perPage));

   // A mutation can empty the page you're on (cancel the only row on the last page).
   // Without this the list renders its "nothing here" copy and the pager unmounts,
   // leaving no way back to page 1.
   if (!loading && page > totalPages) setPage(totalPages);

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
               <SearchField
                  placeholder="Search your events by name…"
                  value={search}
                  onChange={setSearch}
               />
               <FilterSelect
                  label="Type"
                  value={type}
                  onChange={setType}
                  options={EVENT_TYPE_OPTIONS}
                  allLabel="All types"
                  ariaLabel="Filter by event type"
               />
               {/* Your standing on the event, not the event's own status. */}
               <FilterSelect
                  label="Seat"
                  value={seat}
                  onChange={setSeat}
                  options={SEATS}
                  ariaLabel="Filter by seat"
               />
               <FilterSelect
                  label="Sort"
                  value={sort}
                  onChange={setSort}
                  options={SORTS}
                  allLabel="Default"
                  ariaLabel="Sort events"
                  withIcon
               />
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
                        busy={manageBusyId === e.id}
                        /* Only onLeave: you're already on every event in this list,
                           so the control gives the seat up rather than taking one. */
                        onLeave={leaveEvent}
                        onEdit={openEditor}
                        onPublish={publishEvent}
                        onCancel={cancelEvent}
                     />
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

         {editing && (
            <EditEventModal
               event={editing}
               club={editing.club}
               slug={editing.club?.slug}
               onClose={() => setEditing(null)}
               onChanged={() => {
                  setEditing(null);
                  reload();
               }}
            />
         )}
      </AppShell>
   );
}
