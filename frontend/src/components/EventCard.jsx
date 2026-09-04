// The event card, shared by every list that shows events — the student feed, a club's
// management list, the admin's institute-wide list and the club page's events tab.
// The shape is always the same; the callers differ only in what goes in the footer.
import { Link } from "react-router";
import Icon from "./Icon";
import {
   EVENT_COVER_CLASS,
   EVENT_TYPE_LABEL,
   closingSoon,
   eventDateParts,
   eventState,
   formatDuration,
   formatVenue,
   isOver,
   registerState,
   startsIn,
} from "../utils/events";

// Shared register-state → button class mapping.
const REG_CLASS = {
   registered: "registered",
   waitlisted: "waitlisted",
   closed: "muted",
   full: "muted",
};

function LockIcon() {
   return (
      <Icon size={10} strokeWidth={2.6}>
         <rect x="3" y="11" width="18" height="11" rx="2" />
         <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </Icon>
   );
}

export default function EventCard({
   event,
   // Cross-club lists name the host; a club's own list doesn't need to.
   showClub = false,
   // Management lists care about draft / cancelled / past; the student feed only
   // ever sees published events, so the pill would be noise there.
   showStatus = false,
   // Footer actions (Edit / Publish / Cancel / Delete). Rendered in place of the
   // register button when present.
   // A management list passes its own set (Publish, Delete draft…). Everywhere else
   // the card builds the standard pair itself from the row's own permissions.
   actions = null,
   busy = false,
   onRegister,
   onLeave,
   onEdit,
   onPublish,
   onCancel,
}) {
   const { day, month, time } = eventDateParts(event.startAt);
   const cover = EVENT_COVER_CLASS[event.eventType] || event.eventType;
   const state = eventState(event);
   const taken = event.registeredCount ?? 0;
   const left = event.seatsLeft;
   const low = left !== null && left <= 5;
   // Register controls only exist for viewers the API gave a register state to.
   const reg = onRegister || onLeave ? registerState(event) : null;
   // The corner answers whichever question is still open: how long you have to sign up,
   // or — once you hold a seat — how long until it runs.
   const holdsSeat =
      event.viewerStatus === "registered" || event.viewerStatus === "waitlisted";
   const timing = holdsSeat
      ? startsIn(event)
      : reg?.action === "register"
        ? closingSoon(event)
        : null;

   // A finished or cancelled event is a record — the server refuses edits and
   // cancellations alike, so the controls come off rather than failing on click.
   const editable = !isOver(event) && event.status !== "cancelled";
   const ownActions =
      actions ??
      (editable &&
      ((event.canEdit && onEdit) ||
         (event.canPublish && onPublish && event.status === "draft") ||
         (event.canCancel && onCancel)) ? (
         <>
            {event.canEdit && onEdit && (
               <button
                  type="button"
                  className="btn-mini"
                  disabled={busy}
                  onClick={() => onEdit(event)}
               >
                  Edit
               </button>
            )}
            {event.canPublish && onPublish && event.status === "draft" && (
               <button
                  type="button"
                  className="btn-mini on"
                  disabled={busy}
                  onClick={() => onPublish(event)}
               >
                  Publish
               </button>
            )}
            {event.canCancel && onCancel && event.status === "published" && (
               <button
                  type="button"
                  className="btn-mini danger"
                  disabled={busy}
                  onClick={() => onCancel(event)}
               >
                  Cancel
               </button>
            )}
         </>
      ) : null);

   return (
      <div
         className={`event-card${state.cls === "cancelled" ? " dim" : ""}`}
      >
         {/* Management sits on the cover, away from the seat control in the footer.
             A button can't be nested inside the cover's own link, so the wrapper is
             what positions it — anchoring to the card would drop it on the footer. */}
         <div className="ec-cover-wrap">
            {ownActions && (
               <div className="ec-actions">{ownActions}</div>
            )}
            <Link to={`/events/${event.id}`}>
               <div className={`event-cover ${cover}`}>
                  <span className="ec-badge">
                     {EVENT_TYPE_LABEL[event.eventType]}
                  </span>
                  {/* Only the states worth flagging — "Upcoming" is noise on every card. */}
                  {showStatus && state.cls !== "upcoming" ? (
                     <span className={`ec-status ${state.cls}`}>
                        {state.label}
                     </span>
                  ) : (
                     /* Shares the status pill's corner. They can't both apply: a
                        closing window only exists while an event is still upcoming. */
                     timing && <span className="ec-status timing">{timing}</span>
                  )}
                  <div className="ec-date">
                     <div className="ec-day">{day}</div>
                     <div className="ec-month">{month}</div>
                  </div>
               </div>
            </Link>
         </div>
         <div className="event-body">
            <Link className="event-title" to={`/events/${event.id}`}>
               {event.title}
               {event.visibility === "private" && (
                  <span className="et-private" title="Members only">
                     <LockIcon />
                  </span>
               )}
            </Link>
            {showClub && (
               <div className="event-club">{event.club?.name || "—"}</div>
            )}
            <div className="event-meta">
               <span>🕐 {time}</span>
               <span>⏱️ {formatDuration(event.startAt, event.endAt)}</span>
               <span>{formatVenue(event.venue)}</span>
            </div>
            <div className="event-foot">
               <div className="event-spots">
                  {event.capacity ? (
                     <>
                        <b className={low ? "low" : ""}>{left}</b> spots left
                     </>
                  ) : (
                     <>
                        <b>{taken}</b> registered
                     </>
                  )}
               </div>
               {/* A management list passes actions and no register handlers, so it
                   shows only these. On a club's own page a coordinator can hold both:
                   the seat control stays, and the actions sit after it. */}
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
                     {busy ? "…" : reg.state === "registered" ? "✓ In" : reg.label}
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
