// Student dashboard at "/". Three questions, in the order they matter: what am I
// signed up for, what have my clubs said, and what else could I join.
// Faculty land here too (they have no Dashboard link, but the route is shared), so
// every section degrades to something sensible when there are no registrations.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { useAuth } from "../contexts/AuthContext";
import {
   eventsApi,
   announcementsApi,
   profileApi,
   ApiError,
} from "../services";
import AppShell from "../components/layout/AppShell";
import Icon from "../components/Icon";
import { LoadingBlock } from "../components/Spinner";
import EventCard from "../components/EventCard";
import { useToast } from "../contexts/ToastContext";
import { useConfirm } from "../contexts/ConfirmContext";
import { clubHref } from "../utils/nav";
import {
   EVENT_TYPE_LABEL,
   eventDateParts,
   formatEventWhen,
   registerState,
} from "../utils/events";

function Stat({ tone, label, value, children }) {
   return (
      <div className="fac-stat">
         <div className={`fac-stat-ic ${tone}`}>{children}</div>
         <div>
            <div className="fac-stat-label">{label}</div>
            <div className="fac-stat-value">{value}</div>
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

   return (
      <div className="panel">
         <div className="panel-head">
            <div>
               <div className="panel-title">Announcements</div>
               <div className="panel-sub">From clubs you're in or follow</div>
            </div>
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
                           to={`/clubs/${a.club?.slug}/announcements`}
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
                           {a.event.title}
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
   const toast = useToast();
   const confirm = useConfirm();
   const isStudent = user?.role === "student";

   const [when, setWhen] = useState("upcoming");
   const [data, setData] = useState(null);
   const [loadedKey, setLoadedKey] = useState(null);
   const [busyId, setBusyId] = useState(null);
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

   // Headline counts — one call gives clubs, lifetime registrations and what's next.
   const handle = user?.username || user?.id;
   useEffect(() => {
      if (!handle) return;
      let cancelled = false;
      profileApi
         .getProfile(handle)
         .then((d) => !cancelled && setStats(d))
         .catch(() => !cancelled && setStats(null));
      return () => {
         cancelled = true;
      };
   }, [handle, reloadNonce]);

   // Discovery: soonest public events the viewer hasn't already taken a seat at.
   useEffect(() => {
      if (!isStudent) return;
      let cancelled = false;
      eventsApi
         .listEvents({ when: "upcoming", sort: "soonest", limit: 10 })
         .then(
            (d) =>
               !cancelled &&
               setDiscover(
                  (d?.items || []).filter((e) => !e.viewerStatus).slice(0, 3),
               ),
         )
         .catch(() => !cancelled && setDiscover([]));
      return () => {
         cancelled = true;
      };
   }, [isStudent, reloadNonce]);

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
   const loading = loadedKey !== key;
   const comingUp = stats?.eventsPagination?.total ?? 0;
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
               <p className="hm-sub">{greeting}</p>
            </div>

            <div className="overview-grid">
               <div>
                  <div className="fac-stat-row hm-stats">
                     <Stat tone="purple" label="Clubs" value={stats?.stats?.clubs ?? 0}>
                        <Icon size={20} strokeWidth={2.2}>
                           <rect x="2" y="7" width="20" height="14" rx="2" />
                           <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                        </Icon>
                     </Stat>
                     <Stat
                        tone="blue"
                        label="Events registered"
                        value={stats?.stats?.eventsRegistered ?? 0}
                     >
                        <Icon size={20} strokeWidth={2.2}>
                           <rect x="3" y="4" width="18" height="18" rx="2" />
                           <line x1="16" y1="2" x2="16" y2="6" />
                           <line x1="8" y1="2" x2="8" y2="6" />
                           <line x1="3" y1="10" x2="21" y2="10" />
                        </Icon>
                     </Stat>
                     <Stat tone="orange" label="Coming up" value={comingUp}>
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
                              {data?.pagination?.total ?? 0}{" "}
                              {when === "upcoming" ? "coming up" : "already run"}
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
                                          onClick={() => unregister(e)}
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
                  {isStudent && (discover?.length ?? 0) > 0 && (
                     <div className="hm-discover">
                        <div className="ev-head">
                           <div>
                              <div className="panel-title">
                                 Happening on campus
                              </div>
                              <div className="panel-sub">
                                 Open events you haven't signed up for
                              </div>
                           </div>
                           <Link className="link-btn" to="/explore">
                              Explore all →
                           </Link>
                        </div>
                        <div className="event-grid">
                           {discover.map((e) => (
                              <EventCard key={e.id} event={e} showClub />
                           ))}
                        </div>
                     </div>
                  )}
               </div>

               <div>
                  <AnnouncementsPanel role={user?.role} />
               </div>
            </div>
         </div>
      </AppShell>
   );
}

export default Home;
