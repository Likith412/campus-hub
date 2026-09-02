// Dedicated Roles & Permissions page (Phase 6) — /clubs/:slug/roles.
// Roles list on the left, a sticky create/edit editor on the right (mirrors
// .design/Club Roles.html). Gated to coordinators (roles:manage) in the controller.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { clubsApi, ApiError } from "../services";
import AppShell from "../components/layout/AppShell";
import Icon from "../components/Icon";
import { LoadingBlock } from "../components/Spinner";
import { useToast } from "../contexts/ToastContext";
import { useConfirm } from "../contexts/ConfirmContext";
import { useAuth } from "../contexts/AuthContext";
import { clubHref } from "../utils/nav";

const PALETTE = [
   "#6c63ff",
   "#3b82f6",
   "#34d399",
   "#f59e0b",
   "#ef4444",
   "#a855f7",
   "#ec4899",
   "#06b6d4",
   "#64748b",
];

function initials(name = "") {
   const parts = name.trim().split(/\s+/);
   return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

function LockIcon({ size = 13 }) {
   return (
      <Icon size={size} strokeWidth={2.4}>
         <rect x="3" y="11" width="18" height="11" rx="2" />
         <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </Icon>
   );
}

export default function ClubRoles() {
   const { slug } = useParams();
   const { user } = useAuth();
   const toast = useToast();
   const confirm = useConfirm();

   const [club, setClub] = useState(null);
   const [roles, setRoles] = useState([]);
   const [viewer, setViewer] = useState(null);
   const [catalog, setCatalog] = useState([]);
   const [loaded, setLoaded] = useState(false);

   // Editor: editingSlug null → create mode; a slug → editing that role.
   const [editingSlug, setEditingSlug] = useState(null);
   const [name, setName] = useState("");
   const [color, setColor] = useState(PALETTE[0]);
   const [weight, setWeight] = useState(50);
   const [perms, setPerms] = useState(() => new Set());
   const [saving, setSaving] = useState(false);

   const refetchRoles = useCallback(() => {
      return clubsApi
         .listRoles(slug)
         .then((d) => {
            setRoles(d.items || []);
            setViewer(d.viewer || null);
         })
         .catch(() => {});
   }, [slug]);

   useEffect(() => {
      let cancelled = false;
      Promise.all([
         clubsApi.getClub(slug).catch(() => null),
         clubsApi.getPermissionCatalog().catch(() => ({ permissions: [] })),
         refetchRoles(),
      ])
         .then(([c, cat]) => {
            if (cancelled) return;
            setClub(c);
            setCatalog(cat?.permissions || []);
         })
         .finally(() => !cancelled && setLoaded(true));
      return () => {
         cancelled = true;
      };
   }, [slug, refetchRoles]);

   // Group the catalog by its `group` for the permission picker.
   const groups = useMemo(() => {
      const map = new Map();
      for (const p of catalog) {
         if (!map.has(p.group)) map.set(p.group, []);
         map.get(p.group).push(p);
      }
      return [...map.entries()];
   }, [catalog]);

   function startCreate() {
      setEditingSlug(null);
      setName("");
      setColor(PALETTE[0]);
      setWeight(50);
      setPerms(new Set());
   }

   function startEdit(r) {
      setEditingSlug(r.slug);
      setName(r.name);
      setColor(r.color || PALETTE[0]);
      setWeight(r.roleWeight);
      setPerms(new Set(r.permissions));
   }

   const togglePerm = (key) =>
      setPerms((s) => {
         const next = new Set(s);
         next.has(key) ? next.delete(key) : next.add(key);
         return next;
      });

   async function save() {
      if (name.trim().length < 2) {
         toast.error("Enter a role name");
         return;
      }
      if (perms.size === 0) {
         toast.error("Pick at least one permission");
         return;
      }
      setSaving(true);
      try {
         const body = {
            name: name.trim(),
            roleWeight: Number(weight),
            permissions: [...perms],
            color,
         };
         if (editingSlug) {
            await clubsApi.updateRole(slug, editingSlug, body);
            toast.success(`“${body.name}” updated`);
         } else {
            await clubsApi.createRole(slug, body);
            toast.success(`“${body.name}” role created`);
         }
         await refetchRoles();
         startCreate();
      } catch (err) {
         toast.error(
            err instanceof ApiError ? err.message : "Couldn't save role",
         );
      } finally {
         setSaving(false);
      }
   }

   async function remove(r) {
      const ok = await confirm({
         title: `Delete the “${r.name}” role?`,
         message: "This can't be undone.",
         confirmLabel: "Delete role",
         danger: true,
      });
      if (!ok) return;
      try {
         await clubsApi.deleteRole(slug, r.slug);
         toast.success("Role deleted");
         if (editingSlug === r.slug) startCreate();
         await refetchRoles();
      } catch (err) {
         toast.error(
            err instanceof ApiError ? err.message : "Couldn't delete role",
         );
      }
   }

   const canManage = viewer?.canManageRoles;

   // Page-level gate: only roles:manage holders (coordinator/superAdmin implicit) get in.
   // The route is open to any authenticated user, so non-managers are turned away here.
   if (loaded && !canManage) {
      return (
         <AppShell title="Roles & Permissions">
            <div className="main cr-main">
               <div className="profile-empty">
                  You don't have permission to manage this club's roles.
               </div>
            </div>
         </AppShell>
      );
   }

   return (
      <AppShell title="Roles & Permissions">
         <div className="main cr-main">
            <div className="breadcrumb">
               <Link to={clubHref(user?.role, slug)}>{club?.name || "Club"}</Link>
               <span className="sep">›</span>
               <span className="now">Roles</span>
            </div>

            <div className="cr-head">
               <div>
                  <h1 className="cr-title">Roles &amp; permissions</h1>
                  <div className="cr-sub">
                     Define custom roles for{" "}
                     <span className="cr-club-chip">
                        <span className="lg">{initials(club?.name)}</span>
                        {club?.name || "this club"}
                     </span>{" "}
                     and choose exactly what each can do. System roles can't be
                     edited.
                  </div>
               </div>
               {canManage && (
                  <button className="btn btn-primary" onClick={startCreate}>
                     <Icon size={14} strokeWidth={2.5}>
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                     </Icon>
                     New role
                  </button>
               )}
            </div>

            {!loaded ? (
               <LoadingBlock label="Loading roles" size={24} />
            ) : (
               <div className="cr-grid">
                  {/* ROLES LIST */}
                  <div className="cr-roles-list">
                     {roles.map((r) => {
                        const editing = editingSlug === r.slug;
                        const allPerms = r.slug === "coordinator";
                        return (
                           <div
                              key={r.slug}
                              className={`cr-role-card${editing ? " editing" : ""}`}
                           >
                              <div className="cr-role-top">
                                 <div
                                    className="cr-role-badge"
                                    style={{ background: r.color }}
                                 >
                                    {r.isSystem ? (
                                       <LockIcon size={16} />
                                    ) : (
                                       (r.name[0] || "?").toUpperCase()
                                    )}
                                 </div>
                                 <div className="cr-role-info">
                                    <div className="cr-role-name">
                                       {r.name}
                                       {r.isSystem && (
                                          <span className="cr-sys-lock">
                                             <LockIcon size={9} /> System
                                          </span>
                                       )}
                                    </div>
                                    <div className="cr-role-count">
                                       {r.memberCount} member
                                       {r.memberCount === 1 ? "" : "s"} hold this
                                       role
                                    </div>
                                 </div>
                                 <span className="cr-role-weight">
                                    weight {r.roleWeight}
                                 </span>
                                 {canManage && !r.isSystem && (
                                    <div className="cr-role-actions">
                                       <button
                                          className="cr-role-btn"
                                          title="Edit"
                                          onClick={() => startEdit(r)}
                                       >
                                          <Icon size={15} strokeWidth={2.2}>
                                             <path d="M12 20h9" />
                                             <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                                          </Icon>
                                       </button>
                                       <button
                                          className="cr-role-btn del"
                                          disabled={r.memberCount > 0}
                                          title={
                                             r.memberCount > 0
                                                ? "Reassign members first"
                                                : "Delete"
                                          }
                                          onClick={() => remove(r)}
                                       >
                                          <Icon size={15} strokeWidth={2.2}>
                                             <polyline points="3 6 5 6 21 6" />
                                             <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                          </Icon>
                                       </button>
                                    </div>
                                 )}
                              </div>
                              <div className="cr-role-perms">
                                 {allPerms ? (
                                    <span className="cr-perm-chip all">
                                       All permissions
                                    </span>
                                 ) : r.permissions.length === 0 ? (
                                    <span className="cr-perm-chip">
                                       No permissions
                                    </span>
                                 ) : (
                                    r.permissions.map((k) => (
                                       <span key={k} className="cr-perm-chip">
                                          {k}
                                       </span>
                                    ))
                                 )}
                              </div>
                           </div>
                        );
                     })}
                  </div>

                  {/* EDITOR */}
                  <div>
                     <div className="cr-hierarchy">
                        <h4>
                           <span className="ic">
                              <Icon size={13} strokeWidth={2.4}>
                                 <path d="M3 6h18" />
                                 <path d="M7 12h10" />
                                 <path d="M11 18h2" />
                              </Icon>
                           </span>
                           Role hierarchy
                        </h4>
                        <p>
                           You can only assign roles <b>below your own weight</b>{" "}
                           (Coordinator = 100). A higher weight = more authority.
                           The <b>Coordinator</b> role is assigned by a super
                           admin only.
                        </p>
                     </div>

                     {canManage && (
                        <div className="cr-editor">
                           <div className="cr-editor-head">
                              <div className="cr-editor-title">
                                 {editingSlug ? "Edit role" : "Create a role"}
                              </div>
                              {editingSlug && (
                                 <button
                                    className="cr-role-btn"
                                    title="Close"
                                    onClick={startCreate}
                                 >
                                    <Icon size={15} strokeWidth={2.2}>
                                       <line x1="18" y1="6" x2="6" y2="18" />
                                       <line x1="6" y1="6" x2="18" y2="18" />
                                    </Icon>
                                 </button>
                              )}
                           </div>
                           <div className="cr-editor-body">
                              <div className="cr-field">
                                 <label className="cr-label">Role name</label>
                                 <input
                                    className="cr-input"
                                    value={name}
                                    maxLength={40}
                                    placeholder="e.g. Events Lead"
                                    onChange={(e) => setName(e.target.value)}
                                 />
                              </div>

                              <div className="cr-field">
                                 <label className="cr-label">Colour</label>
                                 <div className="cr-swatches">
                                    {PALETTE.map((c) => (
                                       <button
                                          key={c}
                                          type="button"
                                          className={`cr-swatch${color === c ? " active" : ""}`}
                                          style={{ background: c }}
                                          onClick={() => setColor(c)}
                                          aria-label={c}
                                       />
                                    ))}
                                 </div>
                              </div>

                              <div className="cr-field">
                                 <label className="cr-label">
                                    Role weight <span className="hint">1–99</span>
                                 </label>
                                 <div className="cr-weight-row">
                                    <input
                                       type="range"
                                       className="cr-weight-slider"
                                       min={1}
                                       max={99}
                                       value={weight}
                                       onChange={(e) =>
                                          setWeight(e.target.value)
                                       }
                                    />
                                    <span className="cr-weight-val">
                                       {weight}
                                    </span>
                                 </div>
                                 <div className="cr-weight-hint">
                                    Members with this role can assign roles
                                    weighted <b>below</b> their own.
                                 </div>
                              </div>

                              <div className="cr-field">
                                 <label className="cr-label">
                                    Permissions{" "}
                                    <span className="hint">
                                       {perms.size} of {catalog.length}
                                    </span>
                                 </label>
                                 {groups.map(([group, items]) => (
                                    <div key={group}>
                                       <div className="cr-perm-group">
                                          {group}
                                       </div>
                                       {items.map((p) => {
                                          const on = perms.has(p.key);
                                          return (
                                             <div
                                                key={p.key}
                                                className={`cr-perm-row${on ? " on" : ""}`}
                                                onClick={() =>
                                                   togglePerm(p.key)
                                                }
                                             >
                                                <div className="cr-perm-check">
                                                   <Icon
                                                      size={11}
                                                      strokeWidth={3.5}
                                                   >
                                                      <polyline points="20 6 9 17 4 12" />
                                                   </Icon>
                                                </div>
                                                <div className="cr-perm-meta">
                                                   <div className="cr-perm-name">
                                                      {p.label}
                                                   </div>
                                                   <div className="cr-perm-key">
                                                      {p.key}
                                                   </div>
                                                   {p.desc && (
                                                      <div className="cr-perm-desc">
                                                         {p.desc}
                                                      </div>
                                                   )}
                                                </div>
                                             </div>
                                          );
                                       })}
                                    </div>
                                 ))}
                              </div>
                           </div>
                           <div className="cr-editor-foot">
                              {editingSlug && (
                                 <button
                                    className="btn btn-secondary"
                                    onClick={startCreate}
                                 >
                                    Cancel
                                 </button>
                              )}
                              <button
                                 className="btn btn-primary"
                                 onClick={save}
                                 disabled={saving}
                              >
                                 {saving
                                    ? "Saving…"
                                    : editingSlug
                                      ? "Save changes"
                                      : "Create role"}
                              </button>
                           </div>
                        </div>
                     )}
                  </div>
               </div>
            )}
         </div>
      </AppShell>
   );
}
