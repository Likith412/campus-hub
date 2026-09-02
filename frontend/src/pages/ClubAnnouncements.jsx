// A club's notice board — /clubs/:slug/announcements. Members see every notice;
// everyone else sees the public ones. Posting, pinning and deleting are gated
// per-club, so the compose box and row actions only appear for whoever holds the
// permission.
import { Fragment, useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { clubsApi, eventsApi, announcementsApi, ApiError } from "../services";
import AppShell from "../components/layout/AppShell";
import Icon from "../components/Icon";
import Spinner, { LoadingBlock } from "../components/Spinner";
import Pagination from "../components/Pagination";
import { useToast } from "../contexts/ToastContext";
import { useConfirm } from "../contexts/ConfirmContext";
import { useAuth } from "../contexts/AuthContext";
import { clubHref, profileHref } from "../utils/nav";

const PAGE_SIZE = 10;
const VIS_FILTERS = [
   { id: "", label: "All" },
   { id: "public", label: "Everyone" },
   { id: "private", label: "Members only" },
];
const TITLE_MAX = 120;
const BODY_MAX = 4000;

function initials(name = "") {
   const parts = name.trim().split(/\s+/);
   return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

function postedAt(iso) {
   const diff = Date.now() - new Date(iso).getTime();
   const m = 60000,
      h = 3600000,
      d = 86400000;
   if (diff < m) return "just now";
   if (diff < h) return `${Math.floor(diff / m)}m ago`;
   if (diff < d) return `${Math.floor(diff / h)}h ago`;
   if (diff < 7 * d) return `${Math.floor(diff / d)}d ago`;
   return new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
   });
}

const PinIcon = () => (
   <Icon size={13} strokeWidth={2.2}>
      <line x1="12" y1="17" x2="12" y2="22" />
      <path d="M9 2h6l-1 6 3 3v2H7v-2l3-3z" />
   </Icon>
);

// ──────────────────────────────────────────────────────────────────────────────
// Compose box — only rendered when the viewer holds announcements:create.
// ──────────────────────────────────────────────────────────────────────────────
function Composer({ slug, canPin, onPosted }) {
   const toast = useToast();
   const [open, setOpen] = useState(false);
   // Only fetched once the box is open — most visits never write anything.
   const [events, setEvents] = useState([]);
   const [eventId, setEventId] = useState("");
   const [title, setTitle] = useState("");
   const [body, setBody] = useState("");
   const [pinned, setPinned] = useState(false);
   const [visibility, setVisibility] = useState("private");
   const [saving, setSaving] = useState(false);

   useEffect(() => {
      if (!open) return;
      let cancelled = false;
      eventsApi
         .listClubEvents(slug, { when: "upcoming", sort: "soonest", limit: 50 })
         .then((d) => !cancelled && setEvents(d?.items || []))
         .catch(() => !cancelled && setEvents([]));
      return () => {
         cancelled = true;
      };
   }, [open, slug]);

   function reset() {
      setTitle("");
      setBody("");
      setPinned(false);
      setVisibility("private");
      setEventId("");
      setOpen(false);
   }

   async function submit(e) {
      e.preventDefault();
      setSaving(true);
      try {
         const d = await announcementsApi.createAnnouncement(slug, {
            title: title.trim(),
            body: body.trim(),
            visibility,
            pinned,
            ...(eventId ? { eventId } : {}),
         });
         // The count comes back from the server so the author sees the actual reach.
         toast.success(
            d?.notified
               ? `Posted — ${d.notified} ${d.notified === 1 ? "person" : "people"} emailed`
               : "Announcement posted",
         );
         reset();
         onPosted(d?.announcement);
      } catch (err) {
         toast.error(err instanceof ApiError ? err.message : "Couldn't post");
      } finally {
         setSaving(false);
      }
   }

   if (!open) {
      return (
         <button
            type="button"
            className="an-composer-stub"
            onClick={() => setOpen(true)}
         >
            <Icon size={15} strokeWidth={2.2}>
               <line x1="12" y1="5" x2="12" y2="19" />
               <line x1="5" y1="12" x2="19" y2="12" />
            </Icon>
            Write an announcement…
         </button>
      );
   }

   const ready = title.trim().length >= 3 && body.trim().length > 0;

   return (
      <form className="an-composer" onSubmit={submit}>
         <input
            className="input an-title-input"
            value={title}
            maxLength={TITLE_MAX}
            placeholder="What's the headline?"
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
         />
         <textarea
            className="textarea"
            value={body}
            maxLength={BODY_MAX}
            rows={4}
            placeholder="Tell your members what's happening…"
            onChange={(e) => setBody(e.target.value)}
         />
         {events.length > 0 && (
            <label className="an-event-pick">
               <span>About an event</span>
               <select
                  className="input"
                  value={eventId}
                  onChange={(e) => setEventId(e.target.value)}
               >
                  <option value="">Not about a specific event</option>
                  {events.map((e) => (
                     <option key={e.id} value={e.id}>
                        {e.title}
                     </option>
                  ))}
               </select>
               {/* Attaching an event widens who gets the email — say so up front. */}
               {eventId && visibility === "public" && (
                  <small>
                     Everyone registered for it will be emailed too.
                  </small>
               )}
            </label>
         )}
         <div className="an-vis-row">
            {[
               {
                  id: "private",
                  label: "Members only",
                  hint: "Only the club's members can read it, and only they are emailed.",
               },
               {
                  id: "public",
                  label: "Everyone",
                  hint: "Anyone can read it. Members and followers are emailed — plus anyone registered, if you attach an event.",
               },
            ].map((o) => (
               <button
                  type="button"
                  key={o.id}
                  className={`an-vis${visibility === o.id ? " on" : ""}`}
                  onClick={() => setVisibility(o.id)}
               >
                  <span className="an-vis-label">{o.label}</span>
                  <span className="an-vis-hint">{o.hint}</span>
               </button>
            ))}
         </div>
         <div className="an-composer-foot">
            {canPin && (
               <label className="an-pin-toggle">
                  <input
                     type="checkbox"
                     checked={pinned}
                     onChange={(e) => setPinned(e.target.checked)}
                  />
                  <PinIcon />
                  Pin to top
               </label>
            )}
            <span className="an-count">
               {body.length}/{BODY_MAX}
            </span>
            <button type="button" className="btn btn-secondary" onClick={reset}>
               Cancel
            </button>
            <button
               type="submit"
               className="btn btn-primary"
               disabled={!ready || saving}
            >
               {saving && <Spinner size={14} />}
               {saving ? "Posting" : "Post"}
            </button>
         </div>
      </form>
   );
}

// ──────────────────────────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────────────────────────
export default function ClubAnnouncements() {
   const { slug } = useParams();
   const { user } = useAuth();
   const toast = useToast();
   const confirm = useConfirm();

   const [club, setClub] = useState(null);
   const [data, setData] = useState(null);
   const [viewer, setViewer] = useState(null);
   const [denied, setDenied] = useState(false);
   const [search, setSearch] = useState("");
   const [q, setQ] = useState("");
   const [vis, setVis] = useState("");
   const [page, setPage] = useState(1);
   const [busyId, setBusyId] = useState(null);
   const [reloadNonce, setReloadNonce] = useState(0);

   useEffect(() => {
      clubsApi
         .getClub(slug)
         .then((d) => setClub(d?.club || null))
         .catch(() => setClub(null));
   }, [slug]);

   const load = useCallback(() => {
      announcementsApi
         .listClubAnnouncements(slug, {
            q: q || undefined,
            visibility: vis || undefined,
            page,
            limit: PAGE_SIZE,
         })
         .then((d) => {
            setData(d);
            setViewer(d?.viewer || null);
         })
         .catch((err) => {
            if (err instanceof ApiError && err.status === 403) setDenied(true);
            setData({ items: [], pagination: { total: 0 } });
         });
   }, [slug, q, vis, page]);

   useEffect(() => {
      load();
   }, [load, reloadNonce]);

   useEffect(() => {
      const id = setTimeout(() => setQ(search.trim()), 300);
      return () => clearTimeout(id);
   }, [search]);

   // Any filter change restarts paging.
   const filterKey = `${q}|${vis}`;
   const [prevFilters, setPrevFilters] = useState(filterKey);
   if (prevFilters !== filterKey) {
      setPrevFilters(filterKey);
      setPage(1);
   }

   async function togglePin(a) {
      setBusyId(a.id);
      try {
         await announcementsApi.setAnnouncementPinned(slug, a.id, !a.pinned);
         toast.success(a.pinned ? "Unpinned" : "Pinned to top");
         setReloadNonce((n) => n + 1);
      } catch (err) {
         toast.error(err instanceof ApiError ? err.message : "Couldn't pin");
      } finally {
         setBusyId(null);
      }
   }

   async function remove(a) {
      const ok = await confirm({
         title: `Delete “${a.title}”?`,
         message: "Members will no longer see this announcement.",
         confirmLabel: "Delete",
         danger: true,
      });
      if (!ok) return;
      setBusyId(a.id);
      try {
         await announcementsApi.deleteAnnouncement(slug, a.id);
         toast.success("Announcement deleted");
         setReloadNonce((n) => n + 1);
      } catch (err) {
         toast.error(err instanceof ApiError ? err.message : "Couldn't delete");
      } finally {
         setBusyId(null);
      }
   }

   if (denied) {
      return (
         <AppShell title="Announcements" subtitle={club?.name}>
            <div className="main">
               <div className="ev-empty">
                  Only members can read this club's announcements.{" "}
                  <Link to={clubHref(user?.role, slug)}>Back to the club →</Link>
               </div>
            </div>
         </AppShell>
      );
   }

   const items = data?.items || [];
   const total = data?.pagination?.total ?? 0;
   const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

   return (
      <AppShell title="Announcements" subtitle={club?.name}>
         <div className="main club-announcements">
            <div className="page-header">
               <div>
                  <h1 className="page-title">Announcements</h1>
                  <div className="page-sub">
                     Notices from {club?.name || "this club"}. Pinned ones stay at
                     the top{viewer && !viewer.isMember
                        ? " — join the club to see members-only notices."
                        : "."}
                  </div>
               </div>
            </div>

            <div className="ev-head">
               <div>
                  <div className="panel-title">
                     {total} announcement{total === 1 ? "" : "s"}
                  </div>
                  <div className="panel-sub">
                     {vis === "public"
                        ? "Readable by anyone on campus"
                        : vis === "private"
                          ? "Visible to members only"
                          : "Pinned notices stay at the top"}
                  </div>
               </div>
               {/* Members-only is a filter the board can offer; a non-member simply
                   never sees those notices, so the control would be a lie for them. */}
               {viewer?.isMember && (
                  <div className="tabs">
                     {VIS_FILTERS.map((f) => (
                        <button
                           key={f.id || "all"}
                           type="button"
                           className={`tab${vis === f.id ? " active" : ""}`}
                           onClick={() => setVis(f.id)}
                        >
                           {f.label}
                        </button>
                     ))}
                  </div>
               )}
               <div className="fac-search an-search">
                  <Icon size={15}>
                     <circle cx="11" cy="11" r="8" />
                     <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </Icon>
                  <input
                     placeholder="Search announcements…"
                     value={search}
                     onChange={(e) => setSearch(e.target.value)}
                  />
               </div>
            </div>

            {viewer?.canPost && (
               <Composer
                  slug={slug}
                  canPin={viewer.canPin}
                  onPosted={() => {
                     setPage(1);
                     setReloadNonce((n) => n + 1);
                  }}
               />
            )}

            {!data ? (
               <LoadingBlock label="Loading announcements" size={24} />
            ) : items.length === 0 ? (
               <div className="ev-empty">
                  {q || vis
                     ? "No announcements match those filters."
                     : viewer?.canPost
                       ? "Nothing posted yet — write the first announcement above."
                       : "No announcements yet."}
               </div>
            ) : (
               <div className="an-list">
                  {items.map((a, i) => {
                     // The API sorts pinned-first, so the boundary is wherever the
                     // run of pinned notices ends.
                     const startsUnpinned =
                        !a.pinned && i > 0 && items[i - 1].pinned;
                     // Your own note can always come down; anyone else's needs the
                     // delete permission.
                     const canDelete = a.isMine || viewer?.canDeleteAny;
                     return (
                        <Fragment key={a.id}>
                           {startsUnpinned && (
                              <div className="an-divider">
                                 <span>Earlier</span>
                              </div>
                           )}
                        <article
                           className={`an-card${a.pinned ? " pinned" : ""}`}
                        >
                           <div className="an-card-head">
                              <div className="an-avatar">
                                 {initials(a.author?.name)}
                              </div>
                              <div className="an-byline">
                                 <div className="an-title">
                                    {a.pinned && (
                                       <span className="an-pin" title="Pinned">
                                          <PinIcon />
                                       </span>
                                    )}
                                    {a.title}
                                 </div>
                                 <div className="an-meta">
                                    <span
                                       className={`an-vis-tag ${a.visibility}`}
                                       title={
                                          a.visibility === "public"
                                             ? "Anyone can read this"
                                             : "Club members only"
                                       }
                                    >
                                       {a.visibility === "public"
                                          ? "Everyone"
                                          : "Members only"}
                                    </span>
                                    <span className="sep">·</span>
                                    {a.author ? (
                                       <Link
                                          to={profileHref({ id: a.author.id })}
                                          className="pr-name-link"
                                       >
                                          {a.author.name}
                                       </Link>
                                    ) : (
                                       "Unknown"
                                    )}
                                    <span className="sep">·</span>
                                    {postedAt(a.createdAt)}
                                 </div>
                              </div>
                              {busyId === a.id ? (
                                 <Spinner size={16} />
                              ) : (
                                 <div className="an-actions">
                                    {viewer?.canPin && (
                                       <button
                                          type="button"
                                          className={`btn-mini${a.pinned ? " on" : ""}`}
                                          onClick={() => togglePin(a)}
                                       >
                                          {a.pinned ? "Unpin" : "Pin"}
                                       </button>
                                    )}
                                    {canDelete && (
                                       <button
                                          type="button"
                                          className="btn-mini danger"
                                          onClick={() => remove(a)}
                                       >
                                          Delete
                                       </button>
                                    )}
                                 </div>
                              )}
                           </div>
                           <div className="an-body">{a.body}</div>
                           {a.event && (
                              <Link
                                 className="an-event-chip"
                                 to={`/events/${a.event.id}`}
                              >
                                 <Icon size={12} strokeWidth={2.2}>
                                    <rect x="3" y="4" width="18" height="18" rx="2" />
                                    <line x1="16" y1="2" x2="16" y2="6" />
                                    <line x1="8" y1="2" x2="8" y2="6" />
                                    <line x1="3" y1="10" x2="21" y2="10" />
                                 </Icon>
                                 {a.event.title}
                              </Link>
                           )}
                        </article>
                        </Fragment>
                     );
                  })}
               </div>
            )}

            {totalPages > 1 && (
               <Pagination
                  page={page}
                  totalPages={totalPages}
                  perPage={PAGE_SIZE}
                  hasMore={data?.pagination?.hasMore}
                  onChange={setPage}
               />
            )}
         </div>
      </AppShell>
   );
}
