// Explore — /explore. Cross-club event discovery, mirrors .design/Discovery.html.
// Everything on the page runs on real data from /api/events.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { clubsApi, eventsApi, ApiError } from "../services";
import AppShell from "../components/layout/AppShell";
import Icon from "../components/Icon";
import { LoadingBlock } from "../components/Spinner";
import Pagination from "../components/Pagination";
import { useToast } from "../contexts/ToastContext";
import { useConfirm } from "../contexts/ConfirmContext";
import {
   EVENT_TYPE_LABEL,
   EVENT_COVER_CLASS,
   eventDateParts,
   formatDuration,
   registerState,
} from "../utils/events";

const PAGE_SIZE = 9;
const EVENT_SORTS = [
   { id: "soonest", label: "Date · soonest" },
   { id: "latest", label: "Date · latest" },
   { id: "popular", label: "Most registered" },
   { id: "new", label: "Recently created" },
];

const CATEGORIES = [
   { id: "", label: "All" },
   { id: "contest", em: "⚡", label: "Contests" },
   { id: "workshop", em: "🛠️", label: "Workshops" },
   { id: "hackathon", em: "🏆", label: "Hackathons" },
   { id: "seminar", em: "🎙️", label: "Seminars" },
   { id: "fun", em: "🎉", label: "Fun" },
];

// Each pill just seeds the real keyword/type filters below — no hidden magic.
const QUICK_PILLS = [
   { label: "🛠️ Workshops", type: "workshop" },
   { label: "🏆 Hackathons", type: "hackathon" },
   { label: "⚡ Contests", type: "contest" },
   { label: "🎉 Something fun", type: "fun" },
];

function initials(name = "") {
   const parts = name.trim().split(/\s+/);
   return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

function daysUntil(iso) {
   return Math.ceil((new Date(iso) - Date.now()) / 86400000);
}

// A plain, explainable heuristic over real event data: urgency first, then scarcity,
// then how soon it starts. Every card shows the signal that actually put it there.
function rankRecommendations(events) {
   const scored = events
      .filter((e) => e.registrationOpen && !e.isFull)
      .map((e) => {
         const closesIn = daysUntil(e.registrationClosesAt);
         const startsIn = daysUntil(e.startAt);
         const scarce =
            e.capacity > 0 && e.seatsLeft !== null && e.seatsLeft <= e.capacity * 0.25;

         let score = 0;
         let signal = "Open now";
         if (closesIn <= 3) {
            score += 60;
            signal = `Closes in ${Math.max(closesIn, 0)}d`;
         }
         if (scarce) {
            score += 40;
            signal = `${e.seatsLeft} seats left`;
         }
         if (startsIn <= 7) {
            score += 20;
            if (signal === "Open now") signal = "This week";
         }
         score += Math.max(0, 30 - startsIn);
         return { event: e, score, signal };
      });
   scored.sort((a, b) => b.score - a.score);
   return scored.slice(0, 3);
}

// Shared register states → this card's pill classes.
const REG_CLASS = {
   registered: "registered",
   waitlisted: "waitlisted",
};

function EventCard({ event, busy, onRegister, onLeave }) {
   const { day, month, time } = eventDateParts(event.startAt);
   const cover = EVENT_COVER_CLASS[event.eventType] || event.eventType;
   const taken = event.registeredCount;
   const pct = event.capacity ? Math.round((taken / event.capacity) * 100) : 0;
   const left = event.seatsLeft;
   const low = left !== null && left <= 5;
   const reg = registerState(event);

   return (
      <div className="event-card">
         <Link to={`/events/${event.id}`}>
            <div className={`event-cover ${cover}`}>
               <span className="ec-badge">{EVENT_TYPE_LABEL[event.eventType]}</span>
               <div className="ec-date">
                  <div className="ec-day">{day}</div>
                  <div className="ec-month">{month}</div>
               </div>
            </div>
         </Link>
         <div className="event-body">
            <Link className="event-title" to={`/events/${event.id}`}>
               {event.title}
            </Link>
            <div className="event-club">{event.club?.name || "—"}</div>
            <div className="event-meta">
               <span>🕐 {time}</span>
               <span>⏱️ {formatDuration(event.startAt, event.endAt)}</span>
               <span>
                  {event.venue?.type === "online"
                     ? "💻 Online"
                     : `📍 ${event.venue?.location || "TBA"}`}
               </span>
            </div>
            <div className="event-foot">
               <div className="event-spots">
                  {event.capacity ? (
                     <>
                        <span className="progress-mini">
                           <span style={{ width: `${Math.min(pct, 100)}%` }} />
                        </span>
                        <b className={low ? "low" : ""}>{left}</b> spots left
                     </>
                  ) : (
                     <>
                        <b>{taken}</b> registered
                     </>
                  )}
               </div>
               {!reg ? null : reg.action ? (
                  <button
                     type="button"
                     className={`btn-mini ${REG_CLASS[reg.state] || ""}`}
                     disabled={busy}
                     onClick={() =>
                        reg.action === "leave" ? onLeave(event) : onRegister(event)
                     }
                     /* Holding a seat, the button gives it up — hence the hint. */
                     title={
                        reg.action === "leave" ? "Cancel your registration" : undefined
                     }
                  >
                     {busy
                        ? "…"
                        : reg.state === "registered"
                          ? "✓ In"
                          : reg.label}
                  </button>
               ) : (
                  <span className={`btn-mini ${REG_CLASS[reg.state] || "muted"}`}>
                     {reg.state === "registered" ? "✓ In" : reg.label}
                  </span>
               )}
            </div>
         </div>
      </div>
   );
}

export default function Explore() {
   const toast = useToast();
   const confirm = useConfirm();

   const [query, setQuery] = useState("");
   const [search, setSearch] = useState("");
   const [type, setType] = useState("");
   const [when, setWhen] = useState("upcoming");
   const [sort, setSort] = useState("new");
   const [page, setPage] = useState(1);

   const [feed, setFeed] = useState(null);
   const [feedKey, setFeedKey] = useState(null);
   const [pool, setPool] = useState([]);
   const [clubs, setClubs] = useState([]);
   const [busyId, setBusyId] = useState(null);

   const key = `${search}|${type}|${when}|${sort}|${page}`;
   const loading = feedKey !== key;

   const fetchFeed = useCallback(() => {
      eventsApi
         .listEvents({
            q: search || undefined,
            type: type || undefined,
            when,
            sort,
            page,
            limit: PAGE_SIZE,
         })
         .then(setFeed)
         .catch((err) => {
            toast.error(
               err instanceof ApiError ? err.message : "Couldn't load events",
            );
            setFeed({ items: [], pagination: { total: 0 } });
         })
         .finally(() => setFeedKey(`${search}|${type}|${when}|${sort}|${page}`));
   }, [search, type, when, sort, page, toast]);

   useEffect(() => {
      fetchFeed();
   }, [fetchFeed]);

   // A wider unfiltered slice feeds the recommendations and the trending rail.
   const fetchAside = useCallback(() => {
      Promise.all([
         eventsApi.listEvents({ when: "upcoming", limit: 50 }).catch(() => null),
         clubsApi.listClubs({ sort: "popular", limit: 5 }).catch(() => null),
      ]).then(([ev, cl]) => {
         setPool(ev?.items || []);
         setClubs(cl?.items || []);
      });
   }, []);

   useEffect(() => {
      fetchAside();
   }, [fetchAside]);

   const recommendations = useMemo(() => rankRecommendations(pool), [pool]);
   const trending = useMemo(
      () => [...pool].sort((a, b) => b.registeredCount - a.registeredCount).slice(0, 5),
      [pool],
   );

   // Reset to page 1 whenever the filters change.
   const [prev, setPrev] = useState({ search, type, when, sort });
   if (
      prev.search !== search ||
      prev.type !== type ||
      prev.when !== when ||
      prev.sort !== sort
   ) {
      setPrev({ search, type, when, sort });
      setPage(1);
   }

   const pagination = feed?.pagination;
   const totalPages = Math.max(
      1,
      Math.ceil((pagination?.total || 0) / (pagination?.limit || PAGE_SIZE)),
   );

   function runSearch() {
      setSearch(query.trim());
   }

   async function register(event) {
      setBusyId(event.id);
      try {
         const res = await eventsApi.registerForEvent(event.id);
         toast.success(
            res?.registration?.status === "waitlisted"
               ? "Added to the waitlist"
               : "You're registered",
         );
         fetchFeed();
         fetchAside();
      } catch (err) {
         toast.error(err instanceof ApiError ? err.message : "Couldn't register");
      } finally {
         setBusyId(null);
      }
   }

   async function unregister(event) {
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
         fetchFeed();
         fetchAside();
      } catch (err) {
         toast.error(err instanceof ApiError ? err.message : "Couldn't cancel");
      } finally {
         setBusyId(null);
      }
   }

   const items = feed?.items || [];

   return (
      <AppShell title="Explore">
         <div className="main explore">
            <div className="ex-wrap">
               {/* HERO */}
               <div className="hero">
                  <div className="hero-inner">
                     <div className="hero-eyebrow">
                        <span className="pulse" />
                        Discovery
                     </div>
                     <h1>
                        Find your next <em>thing to be obsessed with</em>.
                     </h1>
                     <p>
                        Every workshop, contest, hackathon and seminar running across
                        campus — searchable in one place.
                     </p>

                     <div className="ex-search">
                        <div className="ex-search-ic">
                           <Icon size={16} strokeWidth={2.2}>
                              <circle cx="11" cy="11" r="8" />
                              <line x1="21" y1="21" x2="16.65" y2="16.65" />
                           </Icon>
                        </div>
                        <input
                           value={query}
                           onChange={(e) => setQuery(e.target.value)}
                           onKeyDown={(e) => e.key === "Enter" && runSearch()}
                           placeholder="Search events by name or tag — “rag”, “graph algorithms”, “design”"
                        />
                        <button type="button" onClick={runSearch}>
                           Search
                        </button>
                     </div>

                     <div className="quick-pills">
                        {QUICK_PILLS.map((p) => (
                           <button
                              key={p.label}
                              type="button"
                              className="quick-pill"
                              onClick={() => setType(p.type)}
                           >
                              {p.label}
                           </button>
                        ))}
                     </div>
                  </div>
               </div>

               {/* PICKED FOR YOU */}
               {recommendations.length > 0 && (
                  <div className="ex-recs">
                     <div className="section-head">
                        <div>
                           <div className="section-title">
                              <span className="ex-glyph">
                                 <Icon size={14} strokeWidth={2.5}>
                                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21 12 17.77 5.82 21 7 14.14 2 9.27 8.91 8.26" />
                                 </Icon>
                              </span>
                              Worth a look
                           </div>
                           <div className="section-sub">
                              Ranked by closing date and seats left
                           </div>
                        </div>
                     </div>

                     <div className="recs-grid">
                        {recommendations.map(({ event, signal }) => (
                           <Link
                              key={event.id}
                              className="rec-card"
                              to={`/events/${event.id}`}
                           >
                              <div className="rec-head">
                                 <span className="rec-match">{signal}</span>
                                 <span className="rec-type-pill">
                                    {EVENT_TYPE_LABEL[event.eventType]}
                                 </span>
                              </div>
                              <div className="rec-title">{event.title}</div>
                              <div className="rec-club">{event.club?.name}</div>
                              <div className="rec-because">
                                 Registration closes{" "}
                                 <b>
                                    {new Date(
                                       event.registrationClosesAt,
                                    ).toLocaleDateString("en-IN", {
                                       day: "numeric",
                                       month: "short",
                                    })}
                                 </b>
                                 {event.capacity
                                    ? ` · ${event.seatsLeft} of ${event.capacity} seats left`
                                    : " · open to everyone"}
                              </div>
                              <div className="rec-foot">
                                 <div className="rec-meta">
                                    <span>
                                       📅{" "}
                                       {new Date(event.startAt).toLocaleDateString(
                                          "en-IN",
                                          { weekday: "short", day: "numeric", month: "short" },
                                       )}
                                    </span>
                                    <span>
                                       <b>{formatDuration(event.startAt, event.endAt)}</b>
                                    </span>
                                 </div>
                                 <span className="rec-cta">View →</span>
                              </div>
                           </Link>
                        ))}
                     </div>
                  </div>
               )}

               {/* BROWSE + RAIL */}
               <div className="with-rail">
                  <div>
                     <div className="section-head">
                        <div>
                           <div className="section-title">Browse all events</div>
                           <div className="section-sub">
                              {pagination?.total ?? 0} event
                              {pagination?.total === 1 ? "" : "s"}
                              {when === "upcoming" ? " coming up" : " already run"}
                              {search ? ` matching “${search}”` : ""}
                           </div>
                        </div>
                     </div>

                     <div className="cat-bar">
                        {CATEGORIES.map((c) => (
                           <button
                              key={c.id || "all"}
                              type="button"
                              className={`cat-chip${type === c.id ? " active" : ""}`}
                              onClick={() => setType(c.id)}
                           >
                              {c.em && <span className="em">{c.em}</span>}
                              {c.label}
                           </button>
                        ))}
                        <div className="sort-wrap">
                           Showing
                           <select
                              value={when}
                              onChange={(e) => setWhen(e.target.value)}
                              aria-label="Time range"
                           >
                              <option value="upcoming">Upcoming</option>
                              <option value="past">Past</option>
                           </select>
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
                     </div>

                     {loading && !feed ? (
                        <LoadingBlock label="Loading events" size={24} />
                     ) : items.length === 0 ? (
                        <div className="ev-empty">
                           No events match those filters yet.
                        </div>
                     ) : (
                        <div className="event-grid">
                           {items.map((e) => (
                              <EventCard
                                 key={e.id}
                                 event={e}
                                 busy={busyId === e.id}
                                 onRegister={register}
                                 onLeave={unregister}
                              />
                           ))}
                        </div>
                     )}

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

                  {/* SIDE RAIL */}
                  <div>
                     <div className="rail-panel">
                        <div className="rail-title">
                           Filling up fast
                           <span className="live-dot">Live</span>
                        </div>
                        {trending.length === 0 ? (
                           <div className="rail-empty">Nothing scheduled yet.</div>
                        ) : (
                           trending.map((e, i) => (
                              <Link
                                 key={e.id}
                                 className="trending-row"
                                 to={`/events/${e.id}`}
                              >
                                 <div className="trending-rank">{i + 1}</div>
                                 <div>
                                    <div className="trending-title">{e.title}</div>
                                    <div className="trending-meta">
                                       <span className="heat">
                                          🔥 {e.registeredCount} registered
                                       </span>
                                    </div>
                                 </div>
                              </Link>
                           ))
                        )}
                     </div>

                     <div className="rail-panel">
                        <div className="rail-title">Clubs to explore</div>
                        {clubs.length === 0 ? (
                           <div className="rail-empty">No clubs yet.</div>
                        ) : (
                           clubs.map((c) => (
                              <div key={c.slug} className="club-row">
                                 <div
                                    className="club-avatar"
                                    style={{
                                       background: `linear-gradient(135deg, ${c.coverFrom || "#6c63ff"}, ${c.coverTo || "#34d399"})`,
                                    }}
                                 >
                                    {initials(c.name)}
                                 </div>
                                 <div>
                                    <div className="club-name">{c.name}</div>
                                    <div className="club-meta">
                                       {c.memberCount} member
                                       {c.memberCount === 1 ? "" : "s"}
                                    </div>
                                 </div>
                                 <Link
                                    className={`club-follow${c.membershipStatus === "approved" ? " following" : ""}`}
                                    to={`/clubs/${c.slug}`}
                                 >
                                    {c.membershipStatus === "approved"
                                       ? "Member"
                                       : "View"}
                                 </Link>
                              </div>
                           ))
                        )}
                     </div>
                  </div>
               </div>
            </div>
         </div>
      </AppShell>
   );
}
