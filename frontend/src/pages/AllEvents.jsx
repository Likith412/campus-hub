// Institute-wide events — /admin/events, superAdmin only. Every club's events at every
// status, including drafts and cancelled ones, which the student feed never shows.
// Read-only: managing an event happens inside its club.
import { useEffect, useState } from "react";
import { adminApi, errMessage } from "../services";
import AppShell from "../components/layout/AppShell";
import { LoadingBlock } from "../components/Spinner";
import Pagination from "../components/Pagination";
import { PAGE_SIZE_OPTIONS } from "../utils/pagination";
import EventCard from "../components/EventCard";
import { useToast } from "../contexts/ToastContext";
import {
   EVENT_SORTS,
   EVENT_TYPE_LABEL,
} from "../utils/events";
import useDebounced from "../hooks/useDebounced";
import useLatestRequest from "../hooks/useLatestRequest";
import useEventActions from "../hooks/useEventActions";
import EditEventModal from "../components/EditEventModal";
import SearchField from "../components/SearchField";
import FilterSelect from "../components/FilterSelect";

const STATUS_TABS = [
   { id: "", label: "All" },
   { id: "published", label: "Published" },
   { id: "draft", label: "Drafts" },
   // Past is a date range, not a status — nothing ever writes a "completed" event.
   { id: "past", label: "Past" },
   { id: "cancelled", label: "Cancelled" },
];

export default function AllEvents() {
   const toast = useToast();

   const [search, setSearch] = useState("");
   const debounced = useDebounced(search.trim());
   const [club, setClub] = useState("");
   const [type, setType] = useState("");
   const [status, setStatus] = useState("");
   const [sort, setSort] = useState("new");
   const [page, setPage] = useState(1);
   const [perPage, setPerPage] = useState(PAGE_SIZE_OPTIONS[0]);
   const [data, setData] = useState(null);
   const [clubs, setClubs] = useState([]);
   const [loadedKey, setLoadedKey] = useState(null);
   const startRequest = useLatestRequest();

   const [reloadNonce, setReloadNonce] = useState(0);
   const reload = () => setReloadNonce((n) => n + 1);
   const key = `${debounced}|${club}|${type}|${status}|${sort}|${page}|${perPage}|${reloadNonce}`;
   const loading = loadedKey !== key;


   // The club filter is by slug, so the dropdown needs the full club list once.
   useEffect(() => {
      adminApi
         .listClubs({ limit: 50, sort: "name" })
         .then((d) => setClubs(d?.items || []))
         .catch(() => setClubs([]));
   }, []);

   useEffect(() => {
      const isCurrent = startRequest();
      const myKey = `${debounced}|${club}|${type}|${status}|${sort}|${page}|${perPage}|${reloadNonce}`;
      adminApi
         .listEvents({
            q: debounced || undefined,
            club: club || undefined,
            type: type || undefined,
            status: status && status !== "past" ? status : undefined,
            when: status === "past" ? "past" : undefined,
            sort,
            page,
            limit: perPage,
         })
         .then((d) => {
            if (isCurrent()) setData(d);
         })
         .catch((err) => {
            if (!isCurrent()) return;
            toast.error(
               errMessage(err, "Couldn't load events"),
            );
            setData({ items: [], pagination: { total: 0 } });
         })
         .finally(() => {
            if (isCurrent()) setLoadedKey(myKey);
         });
   }, [
      debounced,
      club,
      type,
      status,
      sort,
      page,
      perPage,
      reloadNonce,
      toast,
      startRequest,
   ]);

   // Reset to page 1 when filters change.
   const [prev, setPrev] = useState({ debounced, club, type, status, sort });
   if (
      prev.debounced !== debounced ||
      prev.club !== club ||
      prev.type !== type ||
      prev.status !== status ||
      prev.sort !== sort
   ) {
      setPrev({ debounced, club, type, status, sort });
      setPage(1);
   }

   const items = data?.items || [];
   // A superAdmin holds every permission, so every row here is actionable.
   const {
      editing,
      setEditing,
      busyId: manageBusyId,
      openEditor,
      publishEvent,
      cancelEvent,
   } = useEventActions(reload);
   const counts = data?.statusCounts || {};
   const pagination = data?.pagination;
   const totalPages = Math.max(
      1,
      Math.ceil((pagination?.total || 0) / (pagination?.limit || perPage)),
   );

   return (
      <AppShell title="All Events">
         <div className="main all-events">
            <div className="fac-pagehead">
               <h1 className="fac-page-title">All events</h1>
               <p className="fac-page-sub">
                  Every event across the campus, at every status — drafts and cancelled
                  ones included. Open a club to publish, edit or cancel.
               </p>
            </div>

            <div className="fac-toolbar">
               <SearchField
                  placeholder="Search events by title or tag…"
                  value={search}
                  onChange={setSearch}
               />
               <select
                  className="ac-select"
                  value={club}
                  onChange={(e) => setClub(e.target.value)}
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
                  value={type}
                  onChange={(e) => setType(e.target.value)}
               >
                  <option value="">All types</option>
                  {Object.entries(EVENT_TYPE_LABEL).map(([id, label]) => (
                     <option key={id} value={id}>
                        {label}
                     </option>
                  ))}
               </select>
               <FilterSelect
                  label="Sort"
                  value={sort}
                  onChange={setSort}
                  options={EVENT_SORTS}
                  ariaLabel="Sort events"
                  withIcon
               />
               {/* Forces the status tabs onto their own row — five of them plus the
                   filters overflow a single line. */}
               <div className="fac-toolbar-break" />
               <div className="fac-tabs">
                  {STATUS_TABS.map((t) => (
                     <button
                        key={t.id || "all"}
                        type="button"
                        className={status === t.id ? "active" : ""}
                        onClick={() => setStatus(t.id)}
                     >
                        {t.label}
                        {t.id && counts[t.id] != null && (
                           <span className="ae-count">{counts[t.id]}</span>
                        )}
                     </button>
                  ))}
               </div>
            </div>

            {loading && !data ? (
               <LoadingBlock label="Loading events" size={24} />
            ) : items.length === 0 ? (
               <div className="ev-empty">No events match those filters.</div>
            ) : (
               <div className={`event-grid${loading ? " is-refetching" : ""}`}>
                  {items.map((e) => (
                     <EventCard
                        key={e.id}
                        event={e}
                        showClub
                        showStatus
                        busy={manageBusyId === e.id}
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
                  hasMore={pagination?.hasMore}
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
