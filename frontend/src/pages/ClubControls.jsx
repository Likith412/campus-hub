import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { clubsApi, adminApi, ApiError } from "../services";
import AppShell from "../components/layout/AppShell";
import Icon from "../components/Icon";
import Spinner, { LoadingBlock } from "../components/Spinner";
import EditClubModal from "../components/EditClubModal";
import { useToast } from "../contexts/ToastContext";
import { useConfirm } from "../contexts/ConfirmContext";

const AVATAR_COLORS = [
   "#6c63ff", "#34d399", "#f59e0b", "#3b82f6",
   "#ef4444", "#a855f7", "#06b6d4", "#ec4899",
];
function colorFor(s = "") {
   let h = 0;
   for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
   return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function initials(name = "") {
   return (
      name
         .replace(/^(Dr|Prof|Mr|Ms|Mrs)\.?\s+/i, "")
         .split(/\s+/)
         .map((w) => w[0])
         .slice(0, 2)
         .join("")
         .toUpperCase() || "?"
   );
}
function clubInitials(name = "") {
   const parts = name.trim().split(/\s+/);
   return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}
function logoGradient(c) {
   return `linear-gradient(135deg, ${c?.coverFrom || "#6c63ff"}, ${c?.coverTo || "#34d399"})`;
}

const CATEGORY_LABEL = {
   tech: "Tech & CS",
   design: "Design",
   culture: "Culture",
   sports: "Sports",
   business: "Business",
   media: "Media",
   social: "Social",
   other: "Other",
};

const STATUS_OPTIONS = [
   {
      id: "active",
      tone: "green",
      name: "Active",
      desc: "Visible everywhere, can run events & recruit",
      icon: <polyline points="20 6 9 17 4 12" />,
   },
   {
      id: "suspended",
      tone: "red",
      name: "Suspended",
      desc: "Temporarily hidden, events paused. Reversible.",
      icon: (
         <>
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
         </>
      ),
   },
   {
      id: "archived",
      tone: "gray",
      name: "Archived",
      desc: "Read-only record. Hidden from all listings.",
      icon: (
         <>
            <polyline points="21 8 21 21 3 21 3 8" />
            <rect x="1" y="3" width="22" height="5" />
            <line x1="10" y1="12" x2="14" y2="12" />
         </>
      ),
   },
];

// Faculty picker modal — assign an active faculty account as a club coordinator.
function FacultyPicker({ slug, clubName, assigned, onClose, onAssigned }) {
   const toast = useToast();
   const confirm = useConfirm();
   const [pool, setPool] = useState(null);
   const [query, setQuery] = useState("");
   const [debounced, setDebounced] = useState("");
   const [busyId, setBusyId] = useState(null);
   const reqRef = useRef(0);

   useEffect(() => {
      const id = setTimeout(() => setDebounced(query.trim()), 300);
      return () => clearTimeout(id);
   }, [query]);

   // Server-side: name/email regex (empty → opening list), ordered by name ascending.
   useEffect(() => {
      const myReq = ++reqRef.current;
      adminApi
         .listUsers({
            role: "faculty",
            status: "active",
            q: debounced || undefined,
            sort: "name",
            limit: 50,
         })
         .then((d) => {
            if (myReq === reqRef.current) setPool(d?.items || []);
         })
         .catch(() => {
            if (myReq === reqRef.current) setPool([]);
         });
   }, [debounced]);

   useEffect(() => {
      const onKey = (e) => e.key === "Escape" && onClose();
      document.addEventListener("keydown", onKey);
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
         document.removeEventListener("keydown", onKey);
         document.body.style.overflow = prev;
      };
   }, [onClose]);

   const assignedIds = useMemo(
      () => new Set(assigned.map((c) => String(c.userId))),
      [assigned],
   );
   // Search is server-side now; just hide faculty already assigned to this club.
   const list = (pool || []).filter((f) => !assignedIds.has(String(f.id)));

   async function assign(f) {
      const ok = await confirm({
         title: `Assign ${f.name}?`,
         message: `${f.name} will become an approved coordinator of ${clubName} with full access to manage its members and events.`,
         confirmLabel: "Assign coordinator",
      });
      if (!ok) return;
      setBusyId(f.id);
      try {
         await clubsApi.addCoordinator(slug, f.id);
         toast.success(`${f.name} assigned as coordinator`);
         onAssigned();
      } catch (err) {
         toast.error(
            err instanceof ApiError ? err.message : "Couldn't assign coordinator",
         );
      } finally {
         setBusyId(null);
      }
   }

   return (
      <div className="fac-overlay" onClick={onClose}>
         <div className="cctl-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cctl-modal-head">
               <div className="cctl-modal-title">Assign faculty coordinator</div>
               <div className="cctl-modal-sub">
                  Only active faculty accounts appear here. Need a new one? Create
                  it in Coordinators.
               </div>
            </div>
            <div className="cctl-modal-search">
               <Icon size={16} strokeWidth={2.2}>
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
               </Icon>
               <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search faculty by name or email…"
                  autoFocus
               />
            </div>
            <div className="cctl-picker">
               {pool === null ? (
                  <LoadingBlock label="Loading faculty" size={20} />
               ) : list.length === 0 ? (
                  <div className="cctl-picker-empty">
                     No matching active faculty. Create one in Coordinators.
                  </div>
               ) : (
                  list.map((f) => (
                     <div className="cctl-picker-row" key={f.id}>
                        <div
                           className="cctl-av sm"
                           style={{ background: colorFor(f.name) }}
                        >
                           {initials(f.name)}
                        </div>
                        <div className="cctl-picker-meta">
                           <div className="cctl-picker-name">{f.name}</div>
                           <div className="cctl-picker-sub">{f.email}</div>
                        </div>
                        <button
                           type="button"
                           className="cctl-picker-add"
                           disabled={busyId === f.id}
                           onClick={() => assign(f)}
                        >
                           {busyId === f.id ? <Spinner size={13} /> : "Assign"}
                        </button>
                     </div>
                  ))
               )}
            </div>
            <div className="cctl-modal-foot">
               <button type="button" className="btn btn-secondary" onClick={onClose}>
                  Done
               </button>
            </div>
         </div>
      </div>
   );
}

export default function ClubControls() {
   const { slug } = useParams();
   const navigate = useNavigate();
   const toast = useToast();
   const confirm = useConfirm();

   const [club, setClub] = useState(null);
   const [coords, setCoords] = useState([]);
   const [loading, setLoading] = useState(true);
   const [busy, setBusy] = useState(false);
   const [editing, setEditing] = useState(false);
   const [pickerOpen, setPickerOpen] = useState(false);
   const reqRef = useRef(0);

   const load = useCallback(() => {
      const myReq = ++reqRef.current;
      Promise.all([
         clubsApi.getClub(slug),
         clubsApi.listMembers(slug, {
            role: "coordinator",
            status: "approved",
            limit: 50,
         }),
      ])
         .then(([clubRes, memRes]) => {
            if (myReq !== reqRef.current) return;
            setClub(clubRes);
            setCoords(memRes?.items || []);
         })
         .catch((err) => {
            if (myReq !== reqRef.current) return;
            toast.error(
               err instanceof ApiError
                  ? err.message
                  : "Couldn't load club controls",
            );
            setClub(false);
         })
         .finally(() => {
            if (myReq === reqRef.current) setLoading(false);
         });
   }, [slug, toast]);

   useEffect(() => {
      load();
   }, [load]);

   async function reloadCoords() {
      try {
         const memRes = await clubsApi.listMembers(slug, {
            role: "coordinator",
            status: "approved",
            limit: 50,
         });
         setCoords(memRes?.items || []);
      } catch {
         /* surfaced elsewhere */
      }
   }

   async function toggleVerify() {
      const next = !club.verified;
      const ok = await confirm({
         title: next
            ? `Verify ${club.name}?`
            : `Remove verification from ${club.name}?`,
         message: next
            ? "This marks the club as institute-verified, showing the ✓ badge across the app."
            : "The ✓ badge will be removed and the club will show as unverified.",
         confirmLabel: next ? "Verify" : "Remove verification",
         danger: !next,
      });
      if (!ok) return;
      setBusy(true);
      try {
         await clubsApi.setVerification(slug, next);
         setClub((c) => ({ ...c, verified: next }));
         toast.success(next ? "Club verified" : "Verification removed");
      } catch (err) {
         toast.error(
            err instanceof ApiError ? err.message : "Couldn't update verification",
         );
      } finally {
         setBusy(false);
      }
   }

   async function changeStatus(next) {
      if (next === club.status) return;
      const verb = { active: "Reactivate", suspended: "Suspend", archived: "Archive" };
      const ok = await confirm({
         title: `${verb[next]} ${club.name}?`,
         message:
            next === "active"
               ? "The club becomes publicly visible and joinable again."
               : next === "suspended"
                 ? "The club is hidden from browse and joining is blocked until reactivated."
                 : "The club is archived and hidden from browse. You can reactivate it later.",
         confirmLabel: verb[next],
         danger: next !== "active",
      });
      if (!ok) return;
      setBusy(true);
      try {
         await clubsApi.setStatus(slug, next);
         setClub((c) => ({ ...c, status: next }));
         toast.success(next === "active" ? "Club reactivated" : `Club ${next}`);
      } catch (err) {
         toast.error(
            err instanceof ApiError ? err.message : "Couldn't update status",
         );
      } finally {
         setBusy(false);
      }
   }

   async function removeCoord(c) {
      const ok = await confirm({
         title: `Remove ${c.name}?`,
         message:
            coords.length === 1
               ? "This is the only coordinator. Removing leaves the club unmanaged — add another first if possible."
               : "They'll be removed from the club and lose coordinator access. (Faculty can't stay on as a regular member.)",
         confirmLabel: "Remove",
         danger: true,
      });
      if (!ok) return;
      try {
         await clubsApi.removeCoordinator(slug, c.userId);
         toast.success(`${c.name} removed · logged`);
         reloadCoords();
      } catch (err) {
         toast.error(
            err instanceof ApiError ? err.message : "Couldn't remove coordinator",
         );
      }
   }

   async function deleteClub() {
      const ok = await confirm({
         title: `Delete ${club.name}?`,
         message:
            "This permanently deletes the club along with all its memberships and events. This cannot be undone.",
         confirmLabel: "Delete club",
         danger: true,
      });
      if (!ok) return;
      setBusy(true);
      try {
         await clubsApi.deleteClub(slug);
         toast.success(`${club.name} deleted`);
         navigate("/admin/clubs");
      } catch (err) {
         toast.error(
            err instanceof ApiError ? err.message : "Couldn't delete club",
         );
         setBusy(false);
      }
   }

   if (loading) {
      return (
         <AppShell title="Club Controls">
            <div className="main cctl-main">
               <LoadingBlock label="Loading club controls" size={24} />
            </div>
         </AppShell>
      );
   }

   if (!club) {
      return (
         <AppShell title="Club Controls">
            <div className="main cctl-main">
               <div className="profile-empty">
                  Club not found.{" "}
                  <Link to="/admin/clubs" className="fac-inline-link">
                     Back to All Clubs
                  </Link>
               </div>
            </div>
         </AppShell>
      );
   }

   return (
      <AppShell title="Club Controls">
         <div className="main cctl-main">
            <div className="breadcrumb">
               <Link to="/admin/clubs">All Clubs</Link>
               <span className="sep">›</span>
               <span className="now">{club.name}</span>
            </div>

            {/* CLUB HEADER */}
            <div className="cctl-header">
               <div
                  className="cctl-logo"
                  style={{ background: logoGradient(club) }}
               >
                  {club.logoUrl ? (
                     <img src={club.logoUrl} alt="" />
                  ) : (
                     clubInitials(club.name)
                  )}
               </div>
               <div className="cctl-head-meta">
                  <div className="cctl-name">
                     {club.name}
                     {club.verified && (
                        <span className="verified-tick" title="Verified">
                           <Icon size={9} strokeWidth={4}>
                              <polyline points="20 6 9 17 4 12" />
                           </Icon>
                        </span>
                     )}
                  </div>
                  <div className="cctl-sub">
                     <span className={`cctl-status-tag ${club.status}`}>
                        <span className="dot" />
                        {club.status[0].toUpperCase() + club.status.slice(1)}
                     </span>
                     <span className="cctl-dot" />
                     <span>{CATEGORY_LABEL[club.category] || club.category}</span>
                     <span className="cctl-dot" />
                     <span>{club.memberCount} members</span>
                     {club.foundedYear && (
                        <>
                           <span className="cctl-dot" />
                           <span>Founded {club.foundedYear}</span>
                        </>
                     )}
                  </div>
               </div>
               <div className="cctl-head-actions">
                  <button
                     type="button"
                     className="btn btn-secondary"
                     onClick={() => setEditing(true)}
                  >
                     <Icon size={13} strokeWidth={2.2}>
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" />
                     </Icon>
                     Edit profile
                  </button>
                  <Link className="btn btn-secondary" to={`/clubs/${club.slug}`}>
                     <Icon size={13} strokeWidth={2.2}>
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                     </Icon>
                     View public page
                  </Link>
               </div>
            </div>

            <div className={`cctl-grid${busy ? " is-busy" : ""}`}>
               {/* MANAGE — the club's own admin surfaces, which a superAdmin can
                   otherwise only reach from the faculty sidebar. */}
               <div className="cctl-panel cctl-span">
                  <div className="cctl-panel-title">
                     <span className="cctl-ic blue">
                        <Icon size={15} strokeWidth={2.2}>
                           <rect x="3" y="3" width="7" height="7" rx="1" />
                           <rect x="14" y="3" width="7" height="7" rx="1" />
                           <rect x="3" y="14" width="7" height="7" rx="1" />
                           <rect x="14" y="14" width="7" height="7" rx="1" />
                        </Icon>
                     </span>
                     Manage this club
                  </div>
                  <div className="cctl-panel-sub">
                     The same surfaces a coordinator uses, with full superAdmin access.
                  </div>
                  <div className="cctl-links">
                     <Link
                        className="cctl-link"
                        to={`/clubs/${club.slug}/members`}
                     >
                        <span className="cctl-link-ic">
                           <Icon size={15} strokeWidth={2.2}>
                              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                              <circle cx="9" cy="7" r="4" />
                              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                           </Icon>
                        </span>
                        <span>
                           <span className="cctl-link-name">Members</span>
                           <span className="cctl-link-sub">
                              Approve, remove, assign roles
                           </span>
                        </span>
                     </Link>
                     <Link className="cctl-link" to={`/clubs/${club.slug}/roles`}>
                        <span className="cctl-link-ic">
                           <Icon size={15} strokeWidth={2.2}>
                              <path d="M12 2 2 7l10 5 10-5-10-5Z" />
                              <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
                           </Icon>
                        </span>
                        <span>
                           <span className="cctl-link-name">Roles</span>
                           <span className="cctl-link-sub">
                              Permissions per role
                           </span>
                        </span>
                     </Link>
                     <Link className="cctl-link" to={`/clubs/${club.slug}/events`}>
                        <span className="cctl-link-ic">
                           <Icon size={15} strokeWidth={2.2}>
                              <rect x="3" y="4" width="18" height="18" rx="2" />
                              <line x1="16" y1="2" x2="16" y2="6" />
                              <line x1="8" y1="2" x2="8" y2="6" />
                              <line x1="3" y1="10" x2="21" y2="10" />
                           </Icon>
                        </span>
                        <span>
                           <span className="cctl-link-name">Events</span>
                           <span className="cctl-link-sub">
                              Publish, edit, cancel
                           </span>
                        </span>
                     </Link>
                  </div>
               </div>

               {/* VERIFICATION */}
               <div className="cctl-panel">
                  <div className="cctl-panel-title">
                     <span className="cctl-ic purple">
                        <Icon size={15} strokeWidth={2.2}>
                           <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                           <polyline points="9 12 11 14 15 10" />
                        </Icon>
                     </span>
                     Verification
                  </div>
                  <div className="cctl-panel-sub">
                     Verified clubs get the ✓ badge and rank higher in Explore.
                  </div>
                  <div className="cctl-verify-row">
                     <div className="cctl-verify-state">
                        <div className="lbl">
                           {club.verified ? "Verified" : "Unverified"}
                        </div>
                        <div className="desc">
                           {club.verified
                              ? "This club is verified. Toggle off to revoke the badge."
                              : "Not verified. Toggle on to award the ✓ badge."}
                        </div>
                     </div>
                     <button
                        type="button"
                        className={`cctl-toggle${club.verified ? " on" : ""}`}
                        disabled={busy}
                        onClick={toggleVerify}
                        aria-label={club.verified ? "Unverify" : "Verify"}
                     />
                  </div>
               </div>

               {/* STATUS */}
               <div className="cctl-panel">
                  <div className="cctl-panel-title">
                     <span className="cctl-ic green">
                        <Icon size={15} strokeWidth={2.2}>
                           <circle cx="12" cy="12" r="10" />
                           <path d="M12 8v4l3 2" />
                        </Icon>
                     </span>
                     Club status
                  </div>
                  <div className="cctl-panel-sub">
                     Controls visibility & whether the club can run events.
                  </div>
                  <div className="cctl-status-options">
                     {STATUS_OPTIONS.map((o) => (
                        <button
                           type="button"
                           key={o.id}
                           className={`cctl-status-opt${club.status === o.id ? " active" : ""}`}
                           disabled={busy}
                           onClick={() => changeStatus(o.id)}
                        >
                           <span className={`cctl-so-ic ${o.tone}`}>
                              <Icon size={17} strokeWidth={2.2}>
                                 {o.icon}
                              </Icon>
                           </span>
                           <span className="cctl-so-meta">
                              <span className="cctl-so-name">{o.name}</span>
                              <span className="cctl-so-desc">{o.desc}</span>
                           </span>
                           <span className="cctl-so-radio" />
                        </button>
                     ))}
                  </div>
               </div>

               {/* COORDINATORS */}
               <div className="cctl-panel full">
                  <div className="cctl-panel-title">
                     <span className="cctl-ic orange">
                        <Icon size={15} strokeWidth={2.2}>
                           <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                           <circle cx="9" cy="7" r="4" />
                           <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                           <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </Icon>
                     </span>
                     Faculty coordinators
                  </div>
                  <div className="cctl-panel-sub">
                     Assign active faculty to run this club. At least one
                     coordinator is required for an active club.
                  </div>
                  {coords.length === 0 && (
                     <div className="cctl-empty-coord">
                        <div className="t">⚠ No coordinator assigned</div>
                        <div className="s">
                           This club needs at least one faculty coordinator. Assign
                           one below.
                        </div>
                     </div>
                  )}
                  <div className="cctl-coord-list">
                     {coords.map((c) => (
                        <div className="cctl-coord-row" key={c.userId}>
                           <div
                              className="cctl-av"
                              style={{ background: colorFor(c.name) }}
                           >
                              {initials(c.name)}
                           </div>
                           <div className="cctl-coord-meta">
                              <div className="cctl-coord-name">{c.name}</div>
                              <div className="cctl-coord-dept">
                                 {c.department || "Faculty coordinator"}
                              </div>
                           </div>
                           <button
                              type="button"
                              className="cctl-coord-remove"
                              title="Remove coordinator"
                              aria-label={`Remove ${c.name}`}
                              onClick={() => removeCoord(c)}
                           >
                              <Icon size={15} strokeWidth={2.2}>
                                 <line x1="18" y1="6" x2="6" y2="18" />
                                 <line x1="6" y1="6" x2="18" y2="18" />
                              </Icon>
                           </button>
                        </div>
                     ))}
                  </div>
                  <button
                     type="button"
                     className="cctl-add-coord"
                     onClick={() => setPickerOpen(true)}
                  >
                     <Icon size={14} strokeWidth={2.5}>
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                     </Icon>
                     Assign faculty coordinator
                  </button>
               </div>

               {/* AUDIT NOTE */}
               <div className="cctl-panel full">
                  <div className="cctl-danger-note">
                     <div className="ic">
                        <Icon size={15} strokeWidth={2.4}>
                           <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                           <line x1="12" y1="9" x2="12" y2="13" />
                           <line x1="12" y1="17" x2="12.01" y2="17" />
                        </Icon>
                     </div>
                     <div>
                        <div className="t">
                           Coordinator removals & status changes are sensitive
                        </div>
                        <div className="s">
                           Archiving hides the club from every listing and is
                           reversible only by a super admin. Step a coordinator
                           down only after a replacement is lined up.
                        </div>
                     </div>
                  </div>
                  <div className="cctl-delete-row">
                     <div className="cctl-delete-copy">
                        <div className="t">Delete this club</div>
                        <div className="s">
                           Permanently removes the club, its memberships and
                           events. This can't be undone.
                        </div>
                     </div>
                     <button
                        type="button"
                        className="cctl-delete-btn"
                        disabled={busy}
                        onClick={deleteClub}
                     >
                        <Icon size={14} strokeWidth={2.2}>
                           <polyline points="3 6 5 6 21 6" />
                           <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                           <line x1="10" y1="11" x2="10" y2="17" />
                           <line x1="14" y1="11" x2="14" y2="17" />
                        </Icon>
                        Delete club
                     </button>
                  </div>
               </div>
            </div>
         </div>

         {editing && (
            <EditClubModal
               club={club}
               slug={slug}
               onClose={() => setEditing(false)}
               onChanged={() => {
                  setEditing(false);
                  load();
               }}
            />
         )}
         {pickerOpen && (
            <FacultyPicker
               slug={slug}
               clubName={club.name}
               assigned={coords}
               onClose={() => setPickerOpen(false)}
               onAssigned={reloadCoords}
            />
         )}
      </AppShell>
   );
}
