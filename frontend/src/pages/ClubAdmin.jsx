// Club Home for whoever runs a club — /clubs/:slug/admin. Mirrors
// .design/Club Admin Dashboard.html: KPI row, pending approvals, upcoming events,
// role split and quick actions. The member-facing page is ClubDetail; this is the
// management view the faculty sidebar points at.
// Gated in-page on holding any club permission, so a delegated student (a President,
// say) gets in too — the route itself is open to any authenticated user.
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { clubsApi, eventsApi, ApiError } from "../services";
import AppShell from "../components/layout/AppShell";
import Icon from "../components/Icon";
import { LoadingBlock } from "../components/Spinner";
import { useToast } from "../contexts/ToastContext";
import { EVENT_TYPE_LABEL, eventDateParts, formatEventWhen } from "../utils/events";
import { initials } from "../utils/text";

function Kpi({ tone, icon, label, value, sub }) {
   return (
      <div className="kpi-card">
         <div className="kpi-head">
            <div className={`kpi-icon ${tone}`}>{icon}</div>
         </div>
         <div className="kpi-value">{value}</div>
         <div className="kpi-label">{label}</div>
         {sub && <div className="kpi-sub">{sub}</div>}
      </div>
   );
}

export default function ClubAdmin() {
   const { slug } = useParams();
   const toast = useToast();

   const [club, setClub] = useState(null);
   const [roles, setRoles] = useState([]);
   const [viewer, setViewer] = useState(null);
   const [eventsViewer, setEventsViewer] = useState(null);
   const [memberStats, setMemberStats] = useState(null);
   const [pending, setPending] = useState([]);
   const [upcoming, setUpcoming] = useState([]);
   const [loaded, setLoaded] = useState(false);
   const [busyId, setBusyId] = useState(null);

   const load = useCallback(() => {
      // Each call is independently catchable: a viewer with events:create but no
      // members:moderate gets a 403 on the member calls and should still see the page.
      return Promise.all([
         clubsApi.getClub(slug).catch(() => null),
         clubsApi.listRoles(slug).catch(() => null),
         eventsApi.listClubEvents(slug, { when: "upcoming", limit: 5 }).catch(() => null),
         clubsApi.getMemberStats(slug).catch(() => null),
         clubsApi
            .listMembers(slug, { status: "pending", limit: 5 })
            .catch(() => null),
      ]).then(([c, r, ev, ms, pend]) => {
         setClub(c);
         setRoles(r?.items || []);
         setViewer(r?.viewer || null);
         setEventsViewer(ev?.viewer || null);
         setUpcoming(ev?.items || []);
         setMemberStats(ms || null);
         setPending(pend?.items || []);
      });
   }, [slug]);

   useEffect(() => {
      load().finally(() => setLoaded(true));
   }, [load]);

   async function moderate(row, status) {
      setBusyId(row.userId);
      try {
         await clubsApi.setMemberStatus(slug, row.userId, status);
         toast.success(status === "approved" ? "Member approved" : "Request rejected");
         await load();
      } catch (err) {
         toast.error(
            err instanceof ApiError ? err.message : "Couldn't update the request",
         );
      } finally {
         setBusyId(null);
      }
   }

   const canManage =
      !!viewer &&
      (viewer.canEditClub ||
         viewer.canModerate ||
         viewer.canAssignRole ||
         viewer.canManageRoles ||
         eventsViewer?.canCreate ||
         eventsViewer?.canEdit ||
         eventsViewer?.canPublish ||
         eventsViewer?.canCancel);

   if (!loaded) {
      return (
         <AppShell title="Club Home" subtitle={club?.name}>
            <div className="main club-admin">
               <LoadingBlock label="Loading club" size={26} />
            </div>
         </AppShell>
      );
   }

   if (!canManage) {
      return (
         <AppShell title="Club Home" subtitle={club?.name}>
            <div className="main club-admin">
               <div className="profile-empty">
                  You don't have permission to manage this club.{" "}
                  <Link to={`/clubs/${slug}`}>View the club page instead →</Link>
               </div>
            </div>
         </AppShell>
      );
   }

   const totalRegistrations = upcoming.reduce(
      (n, e) => n + (e.registeredCount || 0),
      0,
   );
   const roleHolders = roles.reduce((n, r) => n + (r.memberCount || 0), 0);

   return (
      <AppShell title="Club Home" subtitle={club?.name}>
         <div className="main club-admin">
            <div className="page-header">
               <div>
                  <h1 className="page-title">{club?.name || "Club"}</h1>
                  <div className="page-sub">
                     {club?.tagline || "Everything you run for this club, in one place."}
                  </div>
               </div>
               {eventsViewer?.canCreate && (
                  <Link className="btn btn-primary" to={`/clubs/${slug}/events/new`}>
                     <Icon size={14} strokeWidth={2.5}>
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                     </Icon>
                     New event
                  </Link>
               )}
            </div>

            {/* KPIs */}
            <div className="kpi-grid">
               <Kpi
                  tone="purple"
                  label="Members"
                  value={club?.memberCount ?? 0}
                  sub={`${roles.length} roles defined`}
                  icon={
                     <Icon size={16} strokeWidth={2.2}>
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                     </Icon>
                  }
               />
               <Kpi
                  tone="orange"
                  label="Pending requests"
                  value={memberStats?.pending ?? 0}
                  sub={
                     viewer?.canModerate ? "awaiting your review" : "moderation only"
                  }
                  icon={
                     <Icon size={16} strokeWidth={2.2}>
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                     </Icon>
                  }
               />
               <Kpi
                  tone="blue"
                  label="Upcoming events"
                  value={upcoming.length}
                  sub={`${club?.eventCount ?? 0} published all time`}
                  icon={
                     <Icon size={16} strokeWidth={2.2}>
                        <rect x="3" y="4" width="18" height="18" rx="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                     </Icon>
                  }
               />
               <Kpi
                  tone="green"
                  label="Registrations"
                  value={totalRegistrations}
                  sub="across upcoming events"
                  icon={
                     <Icon size={16} strokeWidth={2.2}>
                        <path d="M9 11l3 3L22 4" />
                        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                     </Icon>
                  }
               />
            </div>

            <div className="grid-table-actions">
               <div>
                  {/* PENDING REQUESTS */}
                  {viewer?.canModerate && (
                     <div className="panel" style={{ marginBottom: 16 }}>
                        <div className="panel-head">
                           <div>
                              <div className="panel-title">Join requests</div>
                              <div className="panel-sub">
                                 {pending.length === 0
                                    ? "Nothing waiting on you."
                                    : "Approve or reject without leaving this page."}
                              </div>
                           </div>
                           <Link className="link-btn" to={`/clubs/${slug}/members`}>
                              Manage members →
                           </Link>
                        </div>
                        {pending.length === 0 ? (
                           <div className="ca-empty">The queue is empty.</div>
                        ) : (
                           pending.map((row) => (
                              <div key={row.userId} className="ca-row">
                                 <div className="avatar sm">
                                    {row.avatarUrl ? (
                                       <img src={row.avatarUrl} alt="" />
                                    ) : (
                                       initials(row.name)
                                    )}
                                 </div>
                                 <div>
                                    <div className="ca-name">{row.name}</div>
                                    <div className="ca-meta">
                                       {[row.department, row.email]
                                          .filter(Boolean)
                                          .join(" · ")}
                                    </div>
                                 </div>
                                 <div className="ca-actions">
                                    <button
                                       type="button"
                                       className="btn btn-secondary btn-sm"
                                       disabled={busyId === row.userId}
                                       onClick={() => moderate(row, "rejected")}
                                    >
                                       Reject
                                    </button>
                                    <button
                                       type="button"
                                       className="btn btn-primary btn-sm"
                                       disabled={busyId === row.userId}
                                       onClick={() => moderate(row, "approved")}
                                    >
                                       Approve
                                    </button>
                                 </div>
                              </div>
                           ))
                        )}
                     </div>
                  )}

                  {/* UPCOMING EVENTS */}
                  <div className="panel">
                     <div className="panel-head">
                        <div>
                           <div className="panel-title">Upcoming events</div>
                           <div className="panel-sub">
                              Seats filled across everything you have scheduled.
                           </div>
                        </div>
                        {/* Club Home is the management view, so this goes to the
                            management events page, not the public club page. */}
                        <Link className="link-btn" to={`/clubs/${slug}/events`}>
                           All events →
                        </Link>
                     </div>
                     {upcoming.length === 0 ? (
                        <div className="ca-empty">
                           Nothing scheduled.{" "}
                           {eventsViewer?.canCreate && (
                              <Link to={`/clubs/${slug}/events/new`}>
                                 Create the first one →
                              </Link>
                           )}
                        </div>
                     ) : (
                        upcoming.map((e) => {
                           const { month, day } = eventDateParts(e.startAt);
                           return (
                              <Link
                                 key={e.id}
                                 to={`/events/${e.id}`}
                                 className="ca-row"
                              >
                                 <div className="ev-date">
                                    <div className="ev-month">{month}</div>
                                    <div className="ev-day">{day}</div>
                                 </div>
                                 <div>
                                    <div className="ca-name">
                                       {e.title}
                                       <span
                                          className={`badge ${e.eventType}`}
                                          style={{ fontSize: 9.5 }}
                                       >
                                          {EVENT_TYPE_LABEL[e.eventType]}
                                       </span>
                                       {e.status === "draft" && (
                                          <span className="ev-status draft">Draft</span>
                                       )}
                                    </div>
                                    <div className="ca-meta">
                                       <span>
                                          {formatEventWhen(e.startAt, e.endAt)}
                                       </span>
                                    </div>
                                 </div>
                                 <div className="ca-seats">
                                    <div className="ca-seat-num">
                                       {e.registeredCount}
                                       {e.capacity ? ` / ${e.capacity}` : ""}
                                    </div>
                                 </div>
                              </Link>
                           );
                        })
                     )}
                  </div>
               </div>

               {/* SIDE: role split + quick actions */}
               <div>
                  <div className="panel" style={{ marginBottom: 16 }}>
                     <div className="panel-head">
                        <div>
                           <div className="panel-title">Who holds what</div>
                           <div className="panel-sub">
                              {roleHolders} member{roleHolders === 1 ? "" : "s"} across{" "}
                              {roles.length} roles
                           </div>
                        </div>
                     </div>
                     {roles.map((r) => (
                        <div key={r.slug} className="ca-role">
                           <span
                              className="ca-role-dot"
                              style={{ background: r.color }}
                           />
                           <span className="ca-role-name">{r.name}</span>
                           <span className="ca-role-count">{r.memberCount}</span>
                        </div>
                     ))}
                  </div>
               </div>
            </div>
         </div>
      </AppShell>
   );
}
