// Student dashboard at "/". Three questions, in the order they matter: what am I
// signed up for, what have my clubs said, and what else could I join.
// Faculty land here too (they have no Dashboard link, but the route is shared), so
// every section degrades to something sensible when there are no registrations.
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useAuth } from "../contexts/AuthContext";
import { eventsApi, announcementsApi, profileApi } from "../services";
import AppShell from "../components/layout/AppShell";
import Icon from "../components/Icon";
import { LoadingBlock } from "../components/Spinner";
import EventCard from "../components/EventCard";
import { clubHref } from "../utils/nav";
import useEventActions from "../hooks/useEventActions";
import {
   EVENT_TYPE_LABEL,
   eventDateParts,
   formatEventWhen,
   registerState,
} from "../utils/events";

function Stat({ tone, label, value, loading, children }) {
   return (
      <div className="fac-stat">
         <div className={`fac-stat-ic ${tone}`}>{children}</div>
         <div>
            <div className="fac-stat-label">{label}</div>
            <div className="fac-stat-value">
               {loading ? <span className="skeleton fac-stat-skel" /> : value}
            </div>
         </div>
      </div>
   );
}

// ──────────────────────────────────────────────────────────────────────────────
// Notices from the clubs you're in or follow.
// ──────────────────────────────────────────────────────────────────────────────
function AnnouncementsPanel({ role }) {
   const [data, setData] = useState(null);

   useEffect(() => {
      let cancelled = false;
      announcementsApi
         .listMyAnnouncements({ limit: 3 })
         .then((d) => !cancelled && setData(d))
         .catch(() => !cancelled && setData({ items: [] }));
      return () => {
         cancelled = true;
      };
   }, []);

   const items = data?.items || [];
   const total = data?.pagination?.total ?? 0;

   return (
      <div className="panel">
         <div className="panel-head">
            <div>
               <div className="panel-title">Announcements</div>
               <div className="panel-sub">
                  {total > 0
                     ? `${total} from clubs you're in or follow`
                     : "From clubs you're in or follow"}
               </div>
            </div>
            {/* The panel shows the newest few; the digest has the rest. */}
            {total > items.length && (
               <Link className="link-btn" to="/announcements">
                  See all →
               </Link>
            )}
         </div>
         {!data ? (
            <LoadingBlock label="Loading announcements" size={20} />
         ) : items.length === 0 ? (
            <div className="pr-blank">
               <Icon size={20} strokeWidth={1.8}>
                  <path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1z" />
                  <path d="M16 9a3 3 0 0 1 0 6" />
               </Icon>
               <span>Nothing from your clubs yet.</span>
            </div>
         ) : (
            <div className="an-list">
               {items.map((a) => (
                  <article key={a.id} className="an-card compact">
                     <div className="an-card-head">
                        <div className="an-byline">
                           <div className="an-title">{a.title}</div>
                           <div className="an-meta">
                              <Link to={clubHref(role, a.club?.slug)}>
                                 {a.club?.name}
                              </Link>
                              <span className="sep">·</span>
                              {new Date(a.createdAt).toLocaleDateString("en-IN", {
                                 day: "2-digit",
                                 month: "short",
                              })}
                           </div>
                        </div>
                        <Link
                           className="btn-mini"
                           to={`${clubHref(role, a.club?.slug)}?tab=announcements`}
                        >
                           Open
                        </Link>
                     </div>
                     <div className="an-body clamp">{a.body}</div>
                     {/* Notices attached to an event say so, and link to it. */}
                     {a.event && (
                        <Link
                           className="an-event-chip sm"
                           to={`/events/${a.event.id}`}
                        >
                           <Icon size={11} strokeWidth={2.2}>
                              <rect x="3" y="4" width="18" height="18" rx="2" />
                              <line x1="16" y1="2" x2="16" y2="6" />
                              <line x1="8" y1="2" x2="8" y2="6" />
                              <line x1="3" y1="10" x2="21" y2="10" />
                           </Icon>
                           {/* Wrapped so it's a real flex item — text-overflow has
                               nothing to act on when the title is a bare text node. */}
                           <span>{a.event.title}</span>
                        </Link>
                     )}
                  </article>
               ))}
            </div>
         )}
      </div>
   );
}

// ──────────────────────────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────────────────────────
function Home() {
   const { user } = useAuth();
   const isStudent = user?.role === "student";

   const [when, setWhen] = useState("upcoming");
   const [data, setData] = useState(null);
   const [loadedKey, setLoadedKey] = useState(null);
   const [reloadNonce, setReloadNonce] = useState(0);
   const [stats, setStats] = useState(null);
   const [discover, setDiscover] = useState(null);

   const key = `${when}|${reloadNonce}`;
   useEffect(() => {
      let cancelled = false;
      eventsApi
         .listMyEvents({ when, limit: 6 })
         .then((d) => !cancelled && setData(d))
         .catch(
            () => !cancelled && setData({ items: [], pagination: { total: 0 } }),
         )
         .finally(() => !cancelled && setLoadedKey(key));
      return () => {
         cancelled = true;
      };
   }, [when, key]);

   // Headline counts. The public profile returns these too, but it loads clubs, skills
   // and a page of events to get there — this endpoint just counts.
   useEffect(() => {
      let cancelled = false;
      profileApi
         .getMyStats()
         .then((d) => !cancelled && setStats(d))
         .catch(() => !cancelled && setStats(null));
      return () => {
         cancelled = true;
      };
   }, [reloadNonce]);

   // Discovery: events from clubs you haven't joined that you can still take a seat or
   // a waitlist place at. The feed applies all of that, so asking for three gives three.
   useEffect(() => {
      if (!isStudent) return;
      let cancelled = false;
      eventsApi
         .listEvents({
            clubs: "not-mine",
            openOnly: "true",
            when: "upcoming",
            sort: "soonest",
            limit: 3,
         })
         .then((d) => !cancelled && setDiscover(d?.items || []))
         .catch(() => !cancelled && setDiscover([]));
      return () => {
         cancelled = true;
      };
   }, [isStudent, reloadNonce]);

   // Taking a seat from the discovery rail: the event moves out of "Happening on campus"
   // and into "Your events", so both reload off the same nonce.
   const { busyId, registerEvent, leaveEvent } = useEventActions(() =>
      setReloadNonce((n) => n + 1),
   );

   const items = data?.items || [];
   const loading = loadedKey !== key;
   const comingUp = stats?.upcomingEvents ?? 0;
   // `stats` is the only source for the counts, so nothing below it can be trusted
   // until it lands — the greeting would otherwise claim "nothing booked" first.
   const statsLoading = !stats;
   const greeting =
      comingUp > 0
         ? `${comingUp} event${comingUp === 1 ? "" : "s"} coming up`
         : isStudent
           ? "Nothing booked yet — have a look at what's on."
           : "Here's what's happening across your clubs.";

   return (
      <AppShell title="Dashboard">
         <div className="main">
            <div className="hm-head">
               <h1 className="hm-hello">
                  Welcome back, {user?.name?.split(" ")[0] || "there"}
               </h1>
               {statsLoading ? (
                  <p className="hm-sub">
                     <span className="skeleton hm-sub-skel" />
                  </p>
               ) : (
                  <p className="hm-sub">{greeting}</p>
               )}
            </div>

            <div className={`overview-grid${isStudent ? "" : " solo"}`}>
               <div>
                  <div className="fac-stat-row hm-stats">
                     <Stat
                        tone="purple"
                        label="Clubs"
                        value={stats?.clubs ?? 0}
                        loading={statsLoading}
                     >
                        <Icon size={20} strokeWidth={2.2}>
                           <rect x="2" y="7" width="20" height="14" rx="2" />
                           <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                        </Icon>
                     </Stat>
                     <Stat
                        tone="blue"
                        label="Events registered"
                        value={stats?.eventsRegistered ?? 0}
                        loading={statsLoading}
                     >
                        <Icon size={20} strokeWidth={2.2}>
                           <rect x="3" y="4" width="18" height="18" rx="2" />
                           <line x1="16" y1="2" x2="16" y2="6" />
                           <line x1="8" y1="2" x2="8" y2="6" />
                           <line x1="3" y1="10" x2="21" y2="10" />
                        </Icon>
                     </Stat>
                     <Stat
                        tone="orange"
                        label="Coming up"
                        value={comingUp}
                        loading={statsLoading}
                     >
                        <Icon size={20} strokeWidth={2.2}>
                           <circle cx="12" cy="12" r="10" />
                           <polyline points="12 6 12 12 16 14" />
                        </Icon>
                     </Stat>
                  </div>

                  <div className="panel">
                     <div className="panel-head">
                        <div>
                           <div className="panel-title">Your events</div>
                           <div className="panel-sub">
                              {/* The count comes from the same request as the rows —
                                  don't assert zero before it lands. */}
                              {/* Upcoming reads the same stat as the greeting above,
                                  so the two can't disagree; the list itself also shows
                                  cancelled events, which that stat excludes. */}
                              {data ? (
                                 when === "upcoming" ? (
                                    `${comingUp} coming up`
                                 ) : (
                                    `${data.pagination?.total ?? 0} already run`
                                 )
                              ) : (
                                 <span className="skeleton hm-sub-skel" />
                              )}
                           </div>
                        </div>
                        <div className="tabs">
                           {["upcoming", "past"].map((w) => (
                              <button
                                 key={w}
                                 type="button"
                                 className={`tab${when === w ? " active" : ""}`}
                                 onClick={() => setWhen(w)}
                              >
                                 {w[0].toUpperCase() + w.slice(1)}
                              </button>
                           ))}
                        </div>
                        {/* The panel shows the next few; the page has the rest. */}
                        {isStudent && (
                           <Link className="link-btn" to="/my-events">
                              See all →
                           </Link>
                        )}
                     </div>

                     {loading && !data ? (
                        <LoadingBlock label="Loading your events" size={22} />
                     ) : items.length === 0 ? (
                        <div className="pr-blank">
                           <Icon size={20} strokeWidth={1.8}>
                              <rect x="3" y="4" width="18" height="18" rx="2" />
                              <line x1="16" y1="2" x2="16" y2="6" />
                              <line x1="8" y1="2" x2="8" y2="6" />
                              <line x1="3" y1="10" x2="21" y2="10" />
                           </Icon>
                           <span>
                              {when === "past"
                                 ? "Nothing in your history yet."
                                 : "You haven't signed up for anything yet."}
                           </span>
                        </div>
                     ) : (
                        items.map((e) => {
                           const { month, day } = eventDateParts(e.startAt);
                           const reg = registerState(e);
                           return (
                              // Not a link row: the seat control lives in it, and a
                              // button inside an anchor isn't valid markup.
                              <div key={e.id} className="ca-row">
                                 <div className="ev-date">
                                    <div className="ev-month">{month}</div>
                                    <div className="ev-day">{day}</div>
                                 </div>
                                 <div>
                                    <Link className="ca-name" to={`/events/${e.id}`}>
                                       {e.title}
                                       <span
                                          className={`badge ${e.eventType}`}
                                          style={{ fontSize: 9.5 }}
                                       >
                                          {EVENT_TYPE_LABEL[e.eventType]}
                                       </span>
                                    </Link>
                                    <div className="ca-meta">
                                       <span>
                                          {formatEventWhen(e.startAt, e.endAt)}
                                       </span>
                                       {e.club && <span>{e.club.name}</span>}
                                    </div>
                                 </div>
                                 <div className="ca-seats">
                                    {reg?.action === "leave" ? (
                                       <button
                                          type="button"
                                          className="btn-mini danger"
                                          disabled={busyId === e.id}
                                          title="Cancel your registration"
                                          onClick={() => leaveEvent(e)}
                                       >
                                          {busyId === e.id ? "…" : "Cancel"}
                                       </button>
                                    ) : reg ? (
                                       <span className="btn-mini muted">
                                          {reg.label}
                                       </span>
                                    ) : null}
                                 </div>
                              </div>
                           );
                        })
                     )}
                  </div>

                  {/* Discovery sits under your own events so the left column has
                      something to fill the height beside the notices rail. */}
                  {/* Hidden once loaded and empty — but it holds its place while the
                      request is out, rather than popping in under the events panel. */}
                  {isStudent && (discover === null || discover.length > 0) && (
                     <div className="hm-discover">
                        <div className="ev-head">
                           <div>
                              <div className="panel-title">
                                 Happening on campus
                              </div>
                              <div className="panel-sub">
                                 Clubs you haven't joined — still open to sign up
                              </div>
                           </div>
                           <Link className="link-btn" to="/explore">
                              Explore all →
                           </Link>
                        </div>
                        {discover === null ? (
                           <LoadingBlock label="Finding events" size={20} />
                        ) : (
                           <div className="event-grid">
                              {discover.map((e) => (
                                 <EventCard
                                    key={e.id}
                                    event={e}
                                    showClub
                                    busy={busyId === e.id}
                                    onRegister={registerEvent}
                                 />
                              ))}
                           </div>
                        )}
                     </div>
                  )}
               </div>

               {/* The digest is a student's feed of their memberships and follows;
                   faculty read each club's board from their own sidebar. */}
               {isStudent && (
                  <div>
                     <AnnouncementsPanel role={user?.role} />
                  </div>
               )}
            </div>
         </div>
      </AppShell>
   );
}

export default Home;

