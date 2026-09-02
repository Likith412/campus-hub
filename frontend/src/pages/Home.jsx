import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useAuth } from "../contexts/AuthContext";
import { eventsApi, ApiError } from "../services";
import AppShell from "../components/layout/AppShell";
import { LoadingBlock } from "../components/Spinner";
import { useToast } from "../contexts/ToastContext";
import { useConfirm } from "../contexts/ConfirmContext";
import {
   EVENT_TYPE_LABEL,
   eventDateParts,
   eventState,
   formatEventWhen,
   formatVenue,
   registerState,
} from "../utils/events";

// Dashboard. The events you're signed up for is the one thing that's real so far —
// the rest of the dashboard lands later.
function Home() {
   const { user } = useAuth();
   const toast = useToast();
   const confirm = useConfirm();
   const [when, setWhen] = useState("upcoming");
   const [data, setData] = useState(null);
   const [loadedKey, setLoadedKey] = useState(null);
   const [busyId, setBusyId] = useState(null);
   // Bumped to re-run the fetch effect after a cancellation.
   const [reloadNonce, setReloadNonce] = useState(0);

   useEffect(() => {
      let cancelled = false;
      eventsApi
         .listMyEvents({ when, limit: 10 })
         .then((d) => !cancelled && setData(d))
         .catch(() => !cancelled && setData({ items: [], pagination: { total: 0 } }))
         .finally(() => !cancelled && setLoadedKey(when));
      return () => {
         cancelled = true;
      };
   }, [when, reloadNonce]);

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
         setReloadNonce((n) => n + 1);
      } catch (err) {
         toast.error(err instanceof ApiError ? err.message : "Couldn't cancel");
      } finally {
         setBusyId(null);
      }
   }

   const items = data?.items || [];
   const loading = loadedKey !== when;

   return (
      <AppShell title="Dashboard">
         <div className="main">
            <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
               Welcome, {user?.name?.split(" ")[0] || "there"}
            </h1>
            <p style={{ color: "var(--text-secondary)", marginBottom: 28 }}>
               Signed in as {user?.email}
            </p>

            <div className="ev-head">
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
            </div>

            {loading && !data ? (
               <LoadingBlock label="Loading your events" size={22} />
            ) : items.length === 0 ? (
               <div className="ev-empty">
                  {when !== "upcoming" ? (
                     "Nothing in your history yet."
                  ) : user?.role === "student" ? (
                     <>
                        You haven't signed up for anything yet.{" "}
                        {/* /explore is a student-only route — don't point staff at it. */}
                        <Link to="/explore" className="ed-link">
                           Explore events →
                        </Link>
                     </>
                  ) : (
                     "Nothing here — staff run events rather than register for them."
                  )}
               </div>
            ) : (
               <div className="event-list">
                  {items.map((e) => {
                     const { month, day } = eventDateParts(e.startAt);
                     const state = eventState(e);
                     return (
                        <div key={e.id} className={`ev-card ${state.cls}`}>
                           <div className="ev-date">
                              <div className="ev-month">{month}</div>
                              <div className="ev-day">{day}</div>
                           </div>
                           <div className="ev-info">
                              <Link className="ev-title" to={`/events/${e.id}`}>
                                 {e.title}
                              </Link>
                              <div className="ev-meta">
                                 <span>
                                    🕐 {formatEventWhen(e.startAt, e.endAt)}
                                 </span>
                                 <span>{formatVenue(e.venue)}</span>
                                 <span
                                    className={`badge ${e.eventType}`}
                                    style={{ fontSize: 9.5 }}
                                 >
                                    {EVENT_TYPE_LABEL[e.eventType]}
                                 </span>
                              </div>
                           </div>
                           <div className="ev-stat">
                              Hosted by
                              <b>
                                 <Link to={`/clubs/${e.club?.slug || ""}`}>
                                    {e.club?.name || "—"}
                                 </Link>
                              </b>
                           </div>
                           <span className={`ev-status ${state.cls}`}>
                              {state.label}
                           </span>
                           {/* You're already on it, so the control gives the seat up.
                               registerState drops the action once the event starts. */}
                           {(() => {
                              const reg = registerState(e);
                              if (!reg) return <span />;
                              const cls = reg.state === "waitlisted" ? "wait" : "done";
                              return reg.action === "leave" ? (
                                 <button
                                    type="button"
                                    className={`ev-reg-btn ${cls}`}
                                    disabled={busyId === e.id}
                                    title="Cancel your registration"
                                    onClick={() => unregister(e)}
                                 >
                                    {busyId === e.id ? "…" : reg.label}
                                 </button>
                              ) : (
                                 <span className={`ev-reg-btn ${cls}`}>{reg.label}</span>
                              );
                           })()}
                        </div>
                     );
                  })}
               </div>
            )}
         </div>
      </AppShell>
   );
}

export default Home;
