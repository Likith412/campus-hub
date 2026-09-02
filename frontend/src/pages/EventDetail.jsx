// Event detail — /events/:eventId. Hero + two-column body, following the shape of
// .design/Workshop.html: dark gradient hero, stats panel on the right.
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { eventsApi, announcementsApi, ApiError } from "../services";
import AppShell from "../components/layout/AppShell";
import Icon from "../components/Icon";
import { LoadingBlock } from "../components/Spinner";
import Pagination from "../components/Pagination";
import EditEventModal from "../components/EditEventModal";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { useConfirm } from "../contexts/ConfirmContext";
import { clubHref } from "../utils/nav";
import PersonLink from "../components/PersonLink";
import { initials } from "../utils/text";
import useDebounced from "../hooks/useDebounced";
import {
   EVENT_TYPE_LABEL,
   eventDateParts,
   EVENT_COVER_CLASS,
   eventState,
   formatDuration,
   formatFullDate,
   formatVenue,
   registerState,
} from "../utils/events";

// Shared register states → this page's CTA classes.
const CTA_CLASS = {
   registered: "done",
   waitlisted: "wait",
   register: "primary",
   waitlist: "primary",
};

// "in 3 days" / "tomorrow" / "2 days ago" — a plain relative distance.
function relativeDays(iso) {
   const days = Math.round((new Date(iso) - Date.now()) / 86400000);
   if (days === 0) return "today";
   if (days === 1) return "tomorrow";
   if (days === -1) return "yesterday";
   return days > 0 ? `in ${days} days` : `${Math.abs(days)} days ago`;
}

function Row({ label, children }) {
   return (
      <div className="ed-row">
         <span className="ed-row-k">{label}</span>
         <span
            className="ed-row-v"
            title={typeof children === "string" ? children : undefined}
         >
            {children}
         </span>
      </div>
   );
}

export default function EventDetail() {
   const { eventId } = useParams();
   const navigate = useNavigate();
   const { user } = useAuth();
   const toast = useToast();
   const confirm = useConfirm();

   const [event, setEvent] = useState(null);
   const [viewer, setViewer] = useState(null);
   const [loaded, setLoaded] = useState(false);
   const [busy, setBusy] = useState(false);
   const [attendees, setAttendees] = useState(null);
   const [notices, setNotices] = useState(null);
   const [editing, setEditing] = useState(false);
   const [siblings, setSiblings] = useState([]);
   const [attSearch, setAttSearch] = useState("");
   const attQuery = useDebounced(attSearch.trim());
   const [attPage, setAttPage] = useState(1);
   const [copied, setCopied] = useState(false);

   const refetch = useCallback(() => {
      return eventsApi
         .getEvent(eventId)
         .then((d) => {
            setEvent(d.event);
            setViewer(d.viewer || null);
            return d;
         })
         .catch((err) => {
            toast.error(
               err instanceof ApiError ? err.message : "Couldn't load event",
            );
            setEvent(null);
            return null;
         })
         .finally(() => setLoaded(true));
   }, [eventId, toast]);

   useEffect(() => {
      refetch();
   }, [refetch]);


   const [prevAttQuery, setPrevAttQuery] = useState(attQuery);
   if (prevAttQuery !== attQuery) {
      setPrevAttQuery(attQuery);
      setAttPage(1);
   }

   // The roster is manager-only, so it's a second call made once we know the viewer can.
   const clubSlug = event?.club?.slug;
   const canEdit = !!viewer?.canEdit;
   const ROSTER_PAGE = 8;
   const loadAttendees = useCallback(() => {
      if (!canEdit || !clubSlug) return;
      eventsApi
         .listAttendees(clubSlug, eventId, {
            q: attQuery || undefined,
            page: attPage,
            limit: ROSTER_PAGE,
         })
         .then(setAttendees)
         .catch(() => setAttendees(null));
   }, [canEdit, clubSlug, eventId, attQuery, attPage]);

   useEffect(() => {
      loadAttendees();
   }, [loadAttendees]);

   // Notices the club has posted about this event. Members see the private ones too.
   useEffect(() => {
      let cancelled = false;
      announcementsApi
         .listEventAnnouncements(eventId)
         .then((d) => !cancelled && setNotices(d))
         .catch(() => !cancelled && setNotices({ items: [] }));
      return () => {
         cancelled = true;
      };
   }, [eventId]);

   // "More from this club" — the next few events besides this one.
   useEffect(() => {
      if (!clubSlug) return;
      let cancelled = false;
      eventsApi
         .listClubEvents(clubSlug, { when: "upcoming", limit: 5 })
         .then((d) => {
            if (cancelled) return;
            setSiblings((d?.items || []).filter((x) => x.id !== eventId).slice(0, 3));
         })
         .catch(() => !cancelled && setSiblings([]));
      return () => {
         cancelled = true;
      };
   }, [clubSlug, eventId]);

   async function copyLink() {
      try {
         await navigator.clipboard.writeText(window.location.href);
         setCopied(true);
         setTimeout(() => setCopied(false), 1800);
      } catch {
         toast.error("Couldn't copy the link");
      }
   }

   async function register() {
      setBusy(true);
      try {
         const res = await eventsApi.registerForEvent(eventId);
         toast.success(
            res?.registration?.status === "waitlisted"
               ? "Added to the waitlist"
               : "You're registered",
         );
         await refetch();
         loadAttendees();
      } catch (err) {
         toast.error(err instanceof ApiError ? err.message : "Couldn't register");
      } finally {
         setBusy(false);
      }
   }

   async function leave() {
      const ok = await confirm({
         title: `Cancel your spot at “${event.title}”?`,
         message: "Your seat goes to the next person on the waitlist.",
         confirmLabel: "Cancel registration",
         danger: true,
      });
      if (!ok) return;
      setBusy(true);
      try {
         await eventsApi.unregisterFromEvent(eventId);
         toast.success("Registration cancelled");
         await refetch();
         loadAttendees();
      } catch (err) {
         toast.error(err instanceof ApiError ? err.message : "Couldn't cancel");
      } finally {
         setBusy(false);
      }
   }

   async function setStatus(status) {
      const ok =
         status === "published" ||
         (await confirm({
            title: `Cancel “${event.title}”?`,
            message:
               "Everyone who registered keeps their place on the record, but the event will show as cancelled.",
            confirmLabel: "Cancel event",
            danger: true,
         }));
      if (!ok) return;
      setBusy(true);
      try {
         await eventsApi.setEventStatus(clubSlug, eventId, status);
         toast.success(status === "published" ? "Event published" : "Event cancelled");
         await refetch();
      } catch (err) {
         toast.error(
            err instanceof ApiError ? err.message : "Couldn't update the event",
         );
      } finally {
         setBusy(false);
      }
   }

   async function removeDraft() {
      const ok = await confirm({
         title: "Delete this draft?",
         message: "This can't be undone.",
         confirmLabel: "Delete draft",
         danger: true,
      });
      if (!ok) return;
      try {
         await eventsApi.deleteEvent(clubSlug, eventId);
         toast.success("Draft deleted");
         navigate(`/clubs/${clubSlug}?tab=events`);
      } catch (err) {
         toast.error(err instanceof ApiError ? err.message : "Couldn't delete");
      }
   }

   if (!loaded) {
      return (
         <AppShell title="Event">
            <div className="main event-detail">
               <LoadingBlock label="Loading event" size={26} />
            </div>
         </AppShell>
      );
   }

   if (!event) {
      return (
         <AppShell title="Event">
            <div className="main event-detail">
               <div className="profile-empty">
                  This event doesn't exist, or you don't have access to it.
               </div>
            </div>
         </AppShell>
      );
   }

   const state = eventState(event);
   // Staff run events, they don't attend them — no register control for them.
   const reg = user?.role === "student" ? registerState(event) : null;
   const cover = EVENT_COVER_CLASS[event.eventType] || event.eventType;
   const isPast = state.cls === "past";
   // Which manage actions actually apply right now — the block is hidden when none do.
   const canEditNow =
      viewer?.canEdit && !isPast && event.status !== "cancelled";
   const canPublishNow = viewer?.canPublish && event.status === "draft";
   const canCancelNow =
      viewer?.canCancel && !isPast && event.status === "published";
   const canDeleteNow = viewer?.canCancel && event.status === "draft";
   const isManager =
      !!viewer && (viewer.canEdit || viewer.canPublish || viewer.canCancel);
   // A superAdmin manages a club from the admin surface, not its public page.
   const clubLink = clubHref(user?.role, clubSlug);
   const showManage =
      canEditNow ||
      canPublishNow ||
      canCancelNow ||
      canDeleteNow ||
      (isManager && event.status === "cancelled");
   return (
      <AppShell title="Event" subtitle={event.title}>
         <div className="main event-detail">
            {/* HERO */}
            <div className={`ed-hero ${cover}`}>
               <div className="ed-hero-inner">
                  <div className="ed-hero-l">
                     <div className="ed-eyebrow">
                        {state.cls === "live" && <span className="live-dot" />}
                        {EVENT_TYPE_LABEL[event.eventType]}
                        <span className="ed-dot" />
                        {state.label}
                        {event.visibility === "private" && (
                           <>
                              <span className="ed-dot" />
                              <span className="ed-lock" title="Members only">
                                 <Icon size={11} strokeWidth={2.4}>
                                    <rect x="3" y="11" width="18" height="11" rx="2" />
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                 </Icon>
                              </span>
                           </>
                        )}
                     </div>
                     <h1 className="ed-title">{event.title}</h1>
                     <div className="ed-meta-row">
                        <span>📅 {formatFullDate(event.startAt)}</span>
                        <span>
                           ⏱️ {formatDuration(event.startAt, event.endAt)}
                        </span>
                        <span>{formatVenue(event.venue)}</span>
                        {event.organiser && <span>👤 {event.organiser}</span>}
                     </div>
                     {/* One line saying what actually matters right now. */}
                     <div className="ed-countdown">
                        {isPast
                           ? `Ran ${relativeDays(event.startAt)}`
                           : event.status === "cancelled"
                             ? "This event was called off"
                             : event.registrationOpen
                               ? `Registration closes ${relativeDays(event.registrationClosesAt)} · starts ${relativeDays(event.startAt)}`
                               : `Registration closed · starts ${relativeDays(event.startAt)}`}
                     </div>
                  </div>

                  <div className="ed-hero-r">
                     <div className="ed-seat-label">
                        <span>Registered</span>
                        <b>
                           {event.registeredCount}
                           {event.capacity ? ` / ${event.capacity}` : ""}
                        </b>
                     </div>
                     <div className="ed-seat-meta">
                        <div>
                           {event.capacity ? "Seats left" : "Capacity"}
                           <b>
                              {event.capacity ? event.seatsLeft : "Unlimited"}
                           </b>
                        </div>
                        <div>
                           Closes
                           <b>
                              {new Date(
                                 event.registrationClosesAt,
                              ).toLocaleDateString("en-IN", {
                                 day: "numeric",
                                 month: "short",
                              })}
                           </b>
                        </div>
                        <div>
                           Waitlist
                           <b>
                              {event.waitlistEnabled
                                 ? `${event.waitlistedCount ?? 0} queued`
                                 : "Off"}
                           </b>
                        </div>
                     </div>

                     {reg && (
                        <button
                           type="button"
                           className={`ed-cta ${CTA_CLASS[reg.state] || ""}`}
                           disabled={!reg.action || busy}
                           onClick={() =>
                              reg.action === "leave" ? leave() : register()
                           }
                        >
                           {busy ? "…" : reg.label}
                        </button>
                     )}
                  </div>
               </div>
            </div>

            <div className="ed-grid">
               <div>
                  <div className="ed-block">
                     <div className="ed-block-title">About this event</div>
                     <p className="ed-desc">
                        {event.description ||
                           "The organiser hasn't added a description yet."}
                     </p>
                     {event.tags.length > 0 && (
                        <div className="ed-tags">
                           {event.tags.map((t) => (
                              <span key={t} className="ed-tag">
                                 #{t}
                              </span>
                           ))}
                        </div>
                     )}
                  </div>

                  {/* Notices the club posted about this event. Members also see the
                      private ones; everyone else gets the public ones only. */}
                  {(notices?.items || []).length > 0 && (
                     <div className="ed-block">
                        <div className="ed-block-title">
                           Announcements
                           <span className="ed-count">{notices.items.length}</span>
                        </div>
                        <div className="an-list">
                           {notices.items.map((a) => (
                              <article
                                 key={a.id}
                                 className={`an-card${a.pinned ? " pinned" : ""}`}
                              >
                                 <div className="an-card-head">
                                    <div className="an-byline">
                                       <div className="an-title">{a.title}</div>
                                       <div className="an-meta">
                                          <span
                                             className={`an-vis-tag ${a.visibility}`}
                                          >
                                             {a.visibility === "public"
                                                ? "Everyone"
                                                : "Members only"}
                                          </span>
                                          <span className="sep">·</span>
                                          {a.author?.name || "Unknown"}
                                          <span className="sep">·</span>
                                          {formatFullDate(a.createdAt)}
                                       </div>
                                    </div>
                                 </div>
                                 <div className="an-body compact">{a.body}</div>
                              </article>
                           ))}
                        </div>
                     </div>
                  )}

                  {/* Roster — visible to whoever can edit the event. */}
                  {canEdit && (
                     <div className="ed-block">
                        <div className="ed-block-title">
                           {isPast ? "Who came" : "Who's coming"}
                           <span className="ed-count">
                              {attendees?.pagination?.total ?? 0}
                           </span>
                        </div>
                        <div className="ed-roster-search">
                           <Icon size={13} strokeWidth={2.2}>
                              <circle cx="11" cy="11" r="8" />
                              <line x1="21" y1="21" x2="16.65" y2="16.65" />
                           </Icon>
                           <input
                              placeholder="Search by name or email…"
                              value={attSearch}
                              onChange={(e) => setAttSearch(e.target.value)}
                           />
                        </div>
                        {!attendees ? (
                           <LoadingBlock label="Loading attendees" size={20} />
                        ) : attendees.items.length === 0 ? (
                           <div className="ed-empty">
                              {attQuery
                                 ? `Nobody matching “${attQuery}”.`
                                 : "Nobody has registered yet."}
                           </div>
                        ) : (
                           <div className="ed-people">
                              {attendees.items.map((a) => (
                                 <div key={a.userId} className="ed-person">
                                    <div className="avatar sm">
                                       {a.avatarUrl ? (
                                          <img src={a.avatarUrl} alt="" />
                                       ) : (
                                          initials(a.name)
                                       )}
                                    </div>
                                    <div>
                                       <PersonLink user={a} className="ed-person-name" />
                                       <div className="ed-person-meta">
                                          {[a.department, a.email]
                                             .filter(Boolean)
                                             .join(" · ")}
                                       </div>
                                    </div>
                                    <span className={`ed-pill ${a.status}`}>
                                       {a.status}
                                    </span>
                                 </div>
                              ))}
                           </div>
                        )}

                        {(attendees?.pagination?.total ?? 0) > ROSTER_PAGE && (
                           <Pagination
                              page={attPage}
                              totalPages={Math.max(
                                 1,
                                 Math.ceil(attendees.pagination.total / ROSTER_PAGE),
                              )}
                              perPage={ROSTER_PAGE}
                              hasMore={attendees.pagination.hasMore}
                              onChange={setAttPage}
                           />
                        )}
                     </div>
                  )}
               </div>

               <div>
                  {/* Organiser controls. */}
                  {showManage && (
                     <div className="ed-block">
                        <div className="ed-block-title">Manage</div>
                        <div className="ed-actions">
                           {canEditNow && (
                              <button
                                 type="button"
                                 className="btn btn-secondary"
                                 onClick={() => setEditing(true)}
                              >
                                 <Icon size={14} strokeWidth={2.2}>
                                    <path d="M12 20h9" />
                                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                                 </Icon>
                                 Edit event
                              </button>
                           )}
                           {canPublishNow && (
                              <button
                                 type="button"
                                 className="btn btn-primary"
                                 /* The server won't publish an event that has already
                                    ended — a draft can sit around that long. */
                                 disabled={busy || isPast}
                                 title={
                                    isPast
                                       ? "This event has already ended"
                                       : undefined
                                 }
                                 onClick={() => setStatus("published")}
                              >
                                 <Icon size={14} strokeWidth={2.4}>
                                    <path d="M22 2 11 13" />
                                    <path d="M22 2 15 22l-4-9-9-4Z" />
                                 </Icon>
                                 Publish event
                              </button>
                           )}
                           {canCancelNow && (
                                 <button
                                    type="button"
                                    className="btn btn-danger"
                                    disabled={busy}
                                    onClick={() => setStatus("cancelled")}
                                 >
                                    Cancel event
                                 </button>
                              )}
                           {canDeleteNow && (
                              <button
                                 type="button"
                                 className="btn btn-secondary"
                                 onClick={removeDraft}
                              >
                                 Delete draft
                              </button>
                           )}
                        </div>
                        {event.status === "cancelled" && (
                           <div className="ed-note">
                              This event was cancelled. Create a new one to
                              reschedule.
                           </div>
                        )}
                     </div>
                  )}
                  <div className="ed-block">
                     <div className="ed-block-title">Details</div>
                     <Row label="Hosted by">
                        <Link
                           className="ed-club-chip"
                           to={clubLink}
                        >
                           <span
                              className="ed-club-logo"
                              style={{
                                 background: `linear-gradient(135deg, ${event.club?.coverFrom || "#6c63ff"}, ${event.club?.coverTo || "#34d399"})`,
                              }}
                           >
                              {initials(event.club?.name)}
                           </span>
                           {event.club?.name || "—"}
                        </Link>
                     </Row>
                     <Row label="Type">
                        <span className={`badge ${event.eventType}`}>
                           {EVENT_TYPE_LABEL[event.eventType]}
                        </span>
                     </Row>
                     <Row label="Starts">{formatFullDate(event.startAt)}</Row>
                     <Row label="Ends">{formatFullDate(event.endAt)}</Row>
                     <Row label="Registration closes">
                        {formatFullDate(event.registrationClosesAt)}
                     </Row>
                     <Row label="Where">
                        {event.venue?.type === "online" ? (
                           "Online"
                        ) : (
                           <>{event.venue?.location || "TBA"}</>
                        )}
                     </Row>
                     {event.venue?.meetingUrl && (
                        <Row label="Link">
                           <a
                              href={event.venue.meetingUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="ed-link"
                           >
                              Join online →
                           </a>
                        </Row>
                     )}
                     <Row label="Capacity">
                        {event.capacity ? event.capacity : "Unlimited"}
                     </Row>
                     {event.organiser && (
                        <Row label="Organised by">{event.organiser}</Row>
                     )}

                     <button
                        type="button"
                        className={`ed-share-btn${copied ? " done" : ""}`}
                        onClick={copyLink}
                     >
                        <Icon size={13} strokeWidth={2.2}>
                           {copied ? (
                              <polyline points="20 6 9 17 4 12" />
                           ) : (
                              <>
                                 <rect x="9" y="9" width="13" height="13" rx="2" />
                                 <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                              </>
                           )}
                        </Icon>
                        {copied ? "Link copied" : "Copy link"}
                     </button>
                  </div>

                  {/* Other events this club has coming up. */}
                  {siblings.length > 0 && (
                     <div className="ed-block">
                        <div className="ed-block-title">More from this club</div>
                        {siblings.map((x) => {
                           const d = eventDateParts(x.startAt);
                           return (
                              <Link
                                 key={x.id}
                                 className="ed-sibling"
                                 to={`/events/${x.id}`}
                              >
                                 <div className="ev-date sm">
                                    <div className="ev-month">{d.month}</div>
                                    <div className="ev-day">{d.day}</div>
                                 </div>
                                 <div>
                                    <div className="ed-sibling-name">{x.title}</div>
                                    <div className="ed-sibling-meta">
                                       {EVENT_TYPE_LABEL[x.eventType]} ·{" "}
                                       {x.registeredCount} registered
                                    </div>
                                 </div>
                              </Link>
                           );
                        })}
                     </div>
                  )}

               </div>
            </div>
         </div>

         {editing && (
            <EditEventModal
               event={event}
               club={event.club}
               slug={clubSlug}
               onClose={() => setEditing(false)}
               onChanged={() => {
                  setEditing(false);
                  refetch();
                  loadAttendees();
               }}
            />
         )}
      </AppShell>
   );
}
