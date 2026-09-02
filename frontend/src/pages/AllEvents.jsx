// Institute-wide events — /admin/events, superAdmin only. Every club's events at every
// status, including drafts and cancelled ones, which the student feed never shows.
// Read-only: managing an event happens inside its club.
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { adminApi, ApiError } from "../services";
import AppShell from "../components/layout/AppShell";
import Icon from "../components/Icon";
import { LoadingBlock } from "../components/Spinner";
import Pagination from "../components/Pagination";
import { useToast } from "../contexts/ToastContext";
import {
   EVENT_TYPE_LABEL,
   eventDateParts,
   eventState,
   formatEventWhen,
} from "../utils/events";

const PAGE_SIZE = 20;
const EVENT_SORTS = [
   { id: "soonest", label: "Date · soonest" },
   { id: "latest", label: "Date · latest" },
   { id: "popular", label: "Most registered" },
   { id: "new", label: "Recently created" },
];
const STATUS_TABS = [
   { id: "", label: "All" },
   { id: "published", label: "Published" },
   { id: "draft", label: "Drafts" },
   { id: "completed", label: "Past" },
   { id: "cancelled", label: "Cancelled" },
];

export default function AllEvents() {
   const navigate = useNavigate();
   const toast = useToast();

   const [search, setSearch] = useState("");
   const [debounced, setDebounced] = useState("");
   const [club, setClub] = useState("");
   const [type, setType] = useState("");
   const [status, setStatus] = useState("");
   const [sort, setSort] = useState("new");
   const [page, setPage] = useState(1);
   const [data, setData] = useState(null);
   const [clubs, setClubs] = useState([]);
   const [loadedKey, setLoadedKey] = useState(null);
   const reqIdRef = useRef(0);

   const key = `${debounced}|${club}|${type}|${status}|${sort}|${page}`;
   const loading = loadedKey !== key;

   useEffect(() => {
      const id = setTimeout(() => setDebounced(search.trim()), 300);
      return () => clearTimeout(id);
   }, [search]);

   // The club filter is by slug, so the dropdown needs the full club list once.
   useEffect(() => {
      adminApi
         .listClubs({ limit: 50, sort: "name" })
         .then((d) => setClubs(d?.items || []))
         .catch(() => setClubs([]));
   }, []);

   useEffect(() => {
      const myId = ++reqIdRef.current;
      const myKey = `${debounced}|${club}|${type}|${status}|${sort}|${page}`;
      adminApi
         .listEvents({
            q: debounced || undefined,
            club: club || undefined,
            type: type || undefined,
            status: status || undefined,
            sort,
            page,
            limit: PAGE_SIZE,
         })
         .then((d) => {
            if (myId === reqIdRef.current) setData(d);
         })
         .catch((err) => {
            if (myId !== reqIdRef.current) return;
            toast.error(
               err instanceof ApiError ? err.message : "Couldn't load events",
            );
            setData({ items: [], pagination: { total: 0 } });
         })
         .finally(() => {
            if (myId === reqIdRef.current) setLoadedKey(myKey);
         });
   }, [debounced, club, type, status, sort, page, toast]);

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
   const counts = data?.statusCounts || {};
   const pagination = data?.pagination;
   const totalPages = Math.max(
      1,
      Math.ceil((pagination?.total || 0) / (pagination?.limit || PAGE_SIZE)),
   );

   return (
      <AppShell title="All Events">
         <div className="main all-events">
            <div className="fac-pagehead">
               <div className="breadcrumb">
                  Institute <span className="sep">›</span>{" "}
                  <span className="now">All Events</span>
               </div>
               <h1 className="fac-page-title">All events</h1>
               <p className="fac-page-sub">
                  Every event across the campus, at every status — drafts and cancelled
                  ones included. Open a club to publish, edit or cancel.
               </p>
            </div>

            <div className="fac-toolbar">
               <div className="fac-search">
                  <Icon size={15}>
                     <circle cx="11" cy="11" r="8" />
                     <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </Icon>
                  <input
                     placeholder="Search events by title or tag…"
                     value={search}
                     onChange={(e) => setSearch(e.target.value)}
                  />
               </div>
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
                     {EVENT_SORTS.map((o) => (
                        <option key={o.id} value={o.id}>
                           {o.label}
                        </option>
                     ))}
                  </select>
               </div>
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

            <div className="fac-table-card">
               {loading && !data ? (
                  <LoadingBlock label="Loading events" size={24} />
               ) : items.length === 0 ? (
                  <div className="ev-empty">No events match those filters.</div>
               ) : (
                  <table className={`fac-dt${loading ? " is-refetching" : ""}`}>
                     <thead>
                        <tr>
                           <th>Event</th>
                           <th>Club</th>
                           <th>When</th>
                           <th className="ta-center">Registered</th>
                           <th>Status</th>
                        </tr>
                     </thead>
                     <tbody>
                        {items.map((e) => {
                           const { month, day } = eventDateParts(e.startAt);
                           const state = eventState(e);
                           return (
                              <tr
                                 key={e.id}
                                 className={`ac-row${state.cls === "cancelled" ? " dim" : ""}`}
                                 onClick={() => navigate(`/events/${e.id}`)}
                              >
                                 <td>
                                    <div className="fac-cell">
                                       <div className="ev-date sm">
                                          <div className="ev-month">{month}</div>
                                          <div className="ev-day">{day}</div>
                                       </div>
                                       <div>
                                          <div className="et-name">
                                             {e.title}
                                             {e.visibility === "private" && (
                                                <span
                                                   className="et-private"
                                                   title="Members only"
                                                >
                                                   <Icon size={10} strokeWidth={2.6}>
                                                      <rect x="3" y="11" width="18" height="11" rx="2" />
                                                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                                   </Icon>
                                                </span>
                                             )}
                                          </div>
                                          <div className="et-meta">
                                             <span className={`badge ${e.eventType}`}>
                                                {EVENT_TYPE_LABEL[e.eventType]}
                                             </span>
                                          </div>
                                       </div>
                                    </div>
                                 </td>
                                 <td>
                                    {/* Its own destination — don't let the row steal it. */}
                                    <Link
                                       className="ae-club"
                                       to={`/clubs/${e.club?.slug || ""}`}
                                       onClick={(ev) => ev.stopPropagation()}
                                    >
                                       {e.club?.name || "—"}
                                    </Link>
                                 </td>
                                 <td>{formatEventWhen(e.startAt, e.endAt)}</td>
                                 <td className="ta-center">
                                    <span className="et-seats">
                                       {e.registeredCount}
                                       {e.capacity ? ` / ${e.capacity}` : ""}
                                    </span>
                                 </td>
                                 <td>
                                    <span className={`ev-status ${state.cls}`}>
                                       {state.label}
                                    </span>
                                 </td>
                              </tr>
                           );
                        })}
                     </tbody>
                  </table>
               )}
            </div>

            {items.length > 0 && totalPages > 1 && (
               <Pagination
                  page={page}
                  totalPages={totalPages}
                  perPage={PAGE_SIZE}
                  hasMore={pagination?.hasMore}
                  onChange={setPage}
               />
            )}
         </div>
      </AppShell>
   );
}
