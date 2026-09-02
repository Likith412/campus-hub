// A club's events, for whoever runs it — /clubs/:slug/events. Drafts included, with
// publish / cancel / edit inline. The member-facing list is the Events tab on ClubDetail;
// this is the management view the faculty sidebar points at.
// Gated in-page on any events permission, so a delegated student gets in too.
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { clubsApi, eventsApi, ApiError } from "../services";
import AppShell from "../components/layout/AppShell";
import Icon from "../components/Icon";
import { LoadingBlock } from "../components/Spinner";
import EditEventModal from "../components/EditEventModal";
import EventCard from "../components/EventCard";
import { useToast } from "../contexts/ToastContext";
import { useConfirm } from "../contexts/ConfirmContext";
import { eventState } from "../utils/events";
import useLatestRequest from "../hooks/useLatestRequest";
import FilterSelect from "../components/FilterSelect";

const EVENT_SORTS = [
   { id: "soonest", label: "Date · soonest" },
   { id: "latest", label: "Date · latest" },
   { id: "popular", label: "Most registered" },
   { id: "new", label: "Recently created" },
];

const FILTERS = [
   { id: "all", label: "All" },
   { id: "upcoming", label: "Upcoming" },
   { id: "past", label: "Past" },
   { id: "draft", label: "Drafts" },
];

export default function ClubEvents() {
   const { slug } = useParams();
   const toast = useToast();
   const confirm = useConfirm();

   const [club, setClub] = useState(null);
   const [data, setData] = useState(null);
   const [viewer, setViewer] = useState(null);
   const [filter, setFilter] = useState("all");
   const [sort, setSort] = useState("new");
   const [loadedKey, setLoadedKey] = useState(null);
   const [busyId, setBusyId] = useState(null);
   const [editing, setEditing] = useState(null);
   const startRequest = useLatestRequest();

   const key = `${filter}|${sort}`;
   const loading = loadedKey !== key;

   const load = useCallback(() => {
      const isCurrent = startRequest();
      // "Drafts" is a status filter; the rest are date ranges.
      const params =
         filter === "draft"
            ? { status: "draft", sort, limit: 50 }
            : { when: filter, sort, limit: 50 };
      return Promise.all([
         clubsApi.getClub(slug).catch(() => null),
         eventsApi.listClubEvents(slug, params).catch(() => null),
      ])
         .then(([c, ev]) => {
            if (!isCurrent()) return;
            setClub(c);
            setData(ev);
            setViewer(ev?.viewer || null);
         })
         .finally(() => isCurrent() && setLoadedKey(`${filter}|${sort}`));
   }, [slug, filter, sort, startRequest]);

   useEffect(() => {
      load();
   }, [load]);

   async function setStatus(event, status) {
      if (status === "cancelled") {
         const ok = await confirm({
            title: `Cancel “${event.title}”?`,
            message:
               "Everyone who registered keeps their place on the record, but the event will show as cancelled.",
            confirmLabel: "Cancel event",
            danger: true,
         });
         if (!ok) return;
      }
      setBusyId(event.id);
      try {
         await eventsApi.setEventStatus(slug, event.id, status);
         toast.success(status === "published" ? "Event published" : "Event cancelled");
         await load();
      } catch (err) {
         toast.error(
            err instanceof ApiError ? err.message : "Couldn't update the event",
         );
      } finally {
         setBusyId(null);
      }
   }

   async function removeDraft(event) {
      const ok = await confirm({
         title: `Delete the “${event.title}” draft?`,
         message: "This can't be undone.",
         confirmLabel: "Delete draft",
         danger: true,
      });
      if (!ok) return;
      setBusyId(event.id);
      try {
         await eventsApi.deleteEvent(slug, event.id);
         toast.success("Draft deleted");
         await load();
      } catch (err) {
         toast.error(err instanceof ApiError ? err.message : "Couldn't delete");
      } finally {
         setBusyId(null);
      }
   }

   const canManage =
      !!viewer &&
      (viewer.canCreate ||
         viewer.canEdit ||
         viewer.canPublish ||
         viewer.canCancel);
   // Create only adds the header button; the rest put controls on a row.
   const showRowActions =
      !!viewer && (viewer.canEdit || viewer.canPublish || viewer.canCancel);

   if (loading && !data) {
      return (
         <AppShell title="Events" subtitle={club?.name}>
            <div className="main club-events">
               <LoadingBlock label="Loading events" size={26} />
            </div>
         </AppShell>
      );
   }

   if (!canManage) {
      return (
         <AppShell title="Events" subtitle={club?.name}>
            <div className="main club-events">
               <div className="profile-empty">
                  You don't have permission to manage this club's events.{" "}
                  <Link to={`/clubs/${slug}?tab=events`}>
                     See the club's events instead →
                  </Link>
               </div>
            </div>
         </AppShell>
      );
   }

   const items = data?.items || [];

   return (
      <AppShell title="Events" subtitle={club?.name}>
         <div className="main club-events">
            <div className="page-header">
               <div>
                  <h1 className="page-title">Events</h1>
                  <div className="page-sub">
                     Everything {club?.name || "this club"} has scheduled — drafts
                     included, visible only to your team.
                  </div>
               </div>
               {viewer?.canCreate && (
                  <Link className="btn btn-primary" to={`/clubs/${slug}/events/new`}>
                     <Icon size={14} strokeWidth={2.5}>
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                     </Icon>
                     New event
                  </Link>
               )}
            </div>

            <div className="ev-head">
               <div>
                  <div className="panel-title">
                     {items.length} event{items.length === 1 ? "" : "s"}
                  </div>
               </div>
               <div className="tabs">
                  {FILTERS.map((f) => (
                     <button
                        key={f.id}
                        type="button"
                        className={`tab${filter === f.id ? " active" : ""}`}
                        onClick={() => setFilter(f.id)}
                     >
                        {f.label}
                     </button>
                  ))}
               </div>
               <FilterSelect
                  label="Sort"
                  value={sort}
                  onChange={setSort}
                  options={EVENT_SORTS}
                  ariaLabel="Sort events"
                  withIcon
               />
            </div>

            {items.length === 0 ? (
               <div className="ev-empty">
                  Nothing here.{" "}
                  {viewer?.canCreate && (
                     <Link to={`/clubs/${slug}/events/new`}>Create an event →</Link>
                  )}
               </div>
            ) : (
               <div className="event-grid">
                  {items.map((e) => {
                     const state = eventState(e);
                     const busy = busyId === e.id;
                     // A finished event is a record: the server refuses edits, publishes
                     // and cancellations alike.
                     const over = state.cls === "past";
                     return (
                        <EventCard
                           key={e.id}
                           event={e}
                           showStatus
                           busy={busy}
                           actions={
                              showRowActions ? (
                                 <>
                                    {viewer?.canEdit &&
                                       !over &&
                                       e.status !== "cancelled" && (
                                          <button
                                             type="button"
                                             className="btn-mini"
                                             disabled={busy}
                                             onClick={() => setEditing(e)}
                                          >
                                             Edit
                                          </button>
                                       )}
                                    {viewer?.canPublish && e.status === "draft" && (
                                       <button
                                          type="button"
                                          className="btn-mini on"
                                          disabled={busy || over}
                                          title={
                                             over
                                                ? "This event has already ended"
                                                : undefined
                                          }
                                          onClick={() => setStatus(e, "published")}
                                       >
                                          Publish
                                       </button>
                                    )}
                                    {viewer?.canCancel &&
                                       !over &&
                                       e.status === "published" && (
                                          <button
                                             type="button"
                                             className="btn-mini danger"
                                             disabled={busy}
                                             onClick={() => setStatus(e, "cancelled")}
                                          >
                                             Cancel
                                          </button>
                                       )}
                                    {viewer?.canCancel && e.status === "draft" && (
                                       <button
                                          type="button"
                                          className="btn-mini danger"
                                          disabled={busy}
                                          onClick={() => removeDraft(e)}
                                       >
                                          Delete
                                       </button>
                                    )}
                                 </>
                              ) : null
                           }
                        />
                     );
                  })}
               </div>
            )}
         </div>

         {editing && (
            <EditEventModal
               event={editing}
               club={club}
               slug={slug}
               onClose={() => setEditing(null)}
               onChanged={() => {
                  setEditing(null);
                  load();
               }}
            />
         )}
      </AppShell>
   );
}
