// Explore — /explore. Cross-club event discovery, mirrors .design/Discovery.html.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { clubsApi, eventsApi, errMessage } from "../services";
import AppShell from "../components/layout/AppShell";
import Icon from "../components/Icon";
import { LoadingBlock } from "../components/Spinner";
import Pagination from "../components/Pagination";
import { PAGE_SIZE_OPTIONS } from "../utils/pagination";
import EventCard from "../components/EventCard";
import { useToast } from "../contexts/ToastContext";
import { initials } from "../utils/text";
import useDebounced from "../hooks/useDebounced";
import useLatestRequest from "../hooks/useLatestRequest";
import useEventActions from "../hooks/useEventActions";
import EditEventModal from "../components/EditEventModal";
import { EVENT_SORTS } from "../utils/events";


const CATEGORIES = [
   { id: "", label: "All" },
   { id: "contest", em: "⚡", label: "Contests" },
   { id: "workshop", em: "🛠️", label: "Workshops" },
   { id: "hackathon", em: "🏆", label: "Hackathons" },
   { id: "seminar", em: "🎙️", label: "Seminars" },
   { id: "fun", em: "🎉", label: "Fun" },
];
// Each pill just seeds the type filter below.

export default function Explore() {
   const toast = useToast();

   const [query, setQuery] = useState("");
   const search = useDebounced(query.trim());
   const [type, setType] = useState("");
   // Opens on everything; "not-mine" narrows to clubs you haven't joined, for finding
   // somewhere new rather than re-reading your own clubs' calendars.
   const [clubScope, setClubScope] = useState("all");
   const [when, setWhen] = useState("upcoming");
   const [sort, setSort] = useState("new");
   const [page, setPage] = useState(1);
   const [perPage, setPerPage] = useState(PAGE_SIZE_OPTIONS[0]);

   const [feed, setFeed] = useState(null);
   const [feedKey, setFeedKey] = useState(null);
   const [trending, setTrending] = useState(null);
   const [clubs, setClubs] = useState(null);
   const startRequest = useLatestRequest();

   const key = `${search}|${type}|${clubScope}|${when}|${sort}|${page}|${perPage}`;
   const loading = feedKey !== key;

   const fetchFeed = useCallback(() => {
      const isCurrent = startRequest();
      eventsApi
         .listEvents({
            q: search || undefined,
            type: type || undefined,
            clubs: clubScope === "all" ? undefined : clubScope,
            // A card you can't act on is dead weight in a feed built for signing up.
            // The server ignores this on the past tab.
            openOnly: "true",
            when,
            sort,
            page,
            limit: perPage,
         })
         .then((d) => isCurrent() && setFeed(d))
         .catch((err) => {
            if (!isCurrent()) return;
            toast.error(
               errMessage(err, "Couldn't load events"),
            );
            setFeed({ items: [], pagination: { total: 0 } });
         })
         .finally(
            () =>
               isCurrent() &&
               setFeedKey(
                  `${search}|${type}|${clubScope}|${when}|${sort}|${page}|${perPage}`,
               ),
         );
   }, [search, type, clubScope, when, sort, page, perPage, toast, startRequest]);

   useEffect(() => {
      fetchFeed();
   }, [fetchFeed]);

   // Typing commits on its own after a beat — same as the Clubs page.

   // Both rails ask the API for exactly the five rows they render. They're fetched
   // separately because only one of them can change when you take a seat: registering
   // for an event says nothing about which clubs you belong to.
   const fetchTrending = useCallback(() => {
      eventsApi
         .listEvents({ when: "upcoming", sort: "filling", limit: 5 })
         .then((d) => setTrending(d?.items || []))
         .catch(() => setTrending([]));
   }, []);

   const fetchClubs = useCallback(() => {
      clubsApi
         .listClubs({ sort: "popular", limit: 5, view: "compact" })
         .then((d) => setClubs(d?.items || []))
         .catch(() => setClubs([]));
   }, []);

   useEffect(() => {
      fetchTrending();
   }, [fetchTrending]);

   useEffect(() => {
      fetchClubs();
   }, [fetchClubs]);

   // Reset to page 1 whenever the filters change.
   const [prev, setPrev] = useState({ search, type, clubScope, when, sort });
   if (
      prev.search !== search ||
      prev.type !== type ||
      prev.clubScope !== clubScope ||
      prev.when !== when ||
      prev.sort !== sort
   ) {
      setPrev({ search, type, clubScope, when, sort });
      setPage(1);
   }

   const pagination = feed?.pagination;
   const totalPages = Math.max(
      1,
      Math.ceil((pagination?.total || 0) / (pagination?.limit || perPage)),
   );

   // A mutation can empty the page you're on (cancel the only row on the last page).
   // Without this the list renders its "nothing here" copy and the pager unmounts,
   // leaving no way back to page 1.
   if (!loading && page > totalPages) setPage(totalPages);

   const items = feed?.items || [];
   // Edit / cancel appear on any card whose row says the viewer may — a coordinator
   // browsing the campus feed can act on their own club's events from here.
   const {
      editing,
      setEditing,
      busyId: manageBusyId,
      openEditor,
      registerEvent,
      leaveEvent,
      publishEvent,
      cancelEvent,
      // Taking or giving up a seat moves the feed and the "filling fast" rail.
   } = useEventActions(() => {
      fetchFeed();
      fetchTrending();
   });

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
                              {/* The feed hides anything you already hold a seat at,
                                  so a bare "coming up" overstates what's listed. */}
                              {when === "upcoming"
                                 ? " you haven't signed up for"
                                 : " already run"}
                              {clubScope === "not-mine"
                                 ? ", from clubs you haven't joined"
                                 : ""}
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
                              value={clubScope}
                              onChange={(e) => setClubScope(e.target.value)}
                              aria-label="Club scope"
                           >
                              <option value="all">All clubs</option>
                              <option value="not-mine">
                                 Clubs I haven't joined
                              </option>
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
                           {search || type ? (
                              "No events match those filters yet."
                           ) : clubScope === "not-mine" ? (
                              /* The default filter, not an empty campus — say so, and
                                 give them the way out rather than a dead end. */
                              <>
                                 Nothing new from clubs you haven't joined.{" "}
                                 <button
                                    type="button"
                                    className="link-btn"
                                    onClick={() => setClubScope("all")}
                                 >
                                    Show all clubs →
                                 </button>
                              </>
                           ) : when === "past" ? (
                              "Nothing has run yet."
                           ) : (
                              "Nothing open to join right now — sign-ups may have closed or filled up."
                           )}
                        </div>
                     ) : (
                        <div
                           className={`event-grid${loading ? " is-refetching" : ""}`}
                        >
                           {items.map((e) => (
                              <EventCard
                                 key={e.id}
                                 event={e}
                                 showClub
                                 busy={manageBusyId === e.id}
                                 onRegister={registerEvent}
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
                        {trending === null ? (
                           <LoadingBlock size={18} />
                        ) : trending.length === 0 ? (
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
                                       {/* The panel is called "Filling up fast" —
                                           without this it only ever showed how many
                                           got in, never how close it is to shut. */}
                                       {e.capacity > 0 && (
                                          <span
                                             className={
                                                e.seatsLeft <= 5
                                                   ? "seats-left low"
                                                   : "seats-left"
                                             }
                                          >
                                             {e.seatsLeft === 0
                                                ? "Full"
                                                : `${e.seatsLeft} left`}
                                          </span>
                                       )}
                                    </div>
                                 </div>
                              </Link>
                           ))
                        )}
                     </div>

                     <div className="rail-panel">
                        <div className="rail-title">Clubs to explore</div>
                        {clubs === null ? (
                           <LoadingBlock size={18} />
                        ) : clubs.length === 0 ? (
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
                                    className="club-follow"
                                    to={`/clubs/${c.slug}`}
                                 >
                                    View
                                 </Link>
                              </div>
                           ))
                        )}
                     </div>
                  </div>
               </div>
            </div>
         </div>

         {editing && (
            <EditEventModal
               event={editing}
               club={editing.club}
               slug={editing.club?.slug}
               onClose={() => setEditing(null)}
               onChanged={() => {
                  setEditing(null);
                  fetchFeed();
               }}
            />
         )}
      </AppShell>
   );
}
