// Explore — /explore. Cross-club event discovery, mirrors .design/Discovery.html.
// Everything on the page runs on real data from /api/events.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { clubsApi, eventsApi, ApiError } from "../services";
import AppShell from "../components/layout/AppShell";
import Icon from "../components/Icon";
import { LoadingBlock } from "../components/Spinner";
import Pagination from "../components/Pagination";
import EventCard from "../components/EventCard";
import { useToast } from "../contexts/ToastContext";
import { useConfirm } from "../contexts/ConfirmContext";
import { EVENT_TYPE_LABEL, formatDuration } from "../utils/events";

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
            e.capacity > 0 &&
            e.seatsLeft !== null &&
            e.seatsLeft <= e.capacity * 0.25;

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
         .finally(() =>
            setFeedKey(`${search}|${type}|${when}|${sort}|${page}`),
         );
   }, [search, type, when, sort, page, toast]);

   useEffect(() => {
      fetchFeed();
   }, [fetchFeed]);

   // Typing commits on its own after a beat — same as the Clubs page.
   useEffect(() => {
      const id = setTimeout(() => setSearch(query.trim()), 300);
      return () => clearTimeout(id);
   }, [query]);

   // A wider unfiltered slice feeds the recommendations and the trending rail.
   const fetchAside = useCallback(() => {
      Promise.all([
         eventsApi
            .listEvents({ when: "upcoming", limit: 50 })
            .catch(() => null),
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
      () =>
         [...pool]
            .sort((a, b) => b.registeredCount - a.registeredCount)
            .slice(0, 5),
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
         toast.error(
            err instanceof ApiError ? err.message : "Couldn't register",
         );
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
                     <h1>
                        Find your next <em>thing to be obsessed with</em>.
                     </h1>
                     <p>
                        Workshops, contests, hackathons and seminars you haven't
                        signed up for yet. Your own are on{" "}
                        <Link to="/my-events">My Events</Link>.
                     </p>

                     {/* Same control as the Clubs page: live, debounced, clearable. */}
                     <div className="hero-search">
                        <Icon size={16}>
                           <circle cx="11" cy="11" r="8" />
                           <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </Icon>
                        <input
                           value={query}
                           onChange={(e) => setQuery(e.target.value)}
                           placeholder="Search events by name or tag…"
                        />
                        {query && (
                           <button
                              type="button"
                              className="hero-search-clear"
                              onClick={() => setQuery("")}
                              aria-label="Clear"
                           >
                              <Icon size={14}>
                                 <line x1="18" y1="6" x2="6" y2="18" />
                                 <line x1="6" y1="6" x2="18" y2="18" />
                              </Icon>
                           </button>
                        )}
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
                                       {new Date(
                                          event.startAt,
                                       ).toLocaleDateString("en-IN", {
                                          weekday: "short",
                                          day: "numeric",
                                          month: "short",
                                       })}
                                    </span>
                                    <span>
                                       <b>
                                          {formatDuration(
                                             event.startAt,
                                             event.endAt,
                                          )}
                                       </b>
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
                           <div className="section-title">
                              Browse all events
                           </div>
                           <div className="section-sub">
                              {pagination?.total ?? 0} event
                              {pagination?.total === 1 ? "" : "s"}
                              {when === "upcoming"
                                 ? " coming up"
                                 : " already run"}
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
                                 showClub
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
                           <div className="rail-empty">
                              Nothing scheduled yet.
                           </div>
                        ) : (
                           trending.map((e, i) => (
                              <Link
                                 key={e.id}
                                 className="trending-row"
                                 to={`/events/${e.id}`}
                              >
                                 <div className="trending-rank">{i + 1}</div>
                                 <div>
                                    <div className="trending-title">
                                       {e.title}
                                    </div>
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
