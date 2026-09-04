import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useParams } from "react-router";
import { clubsApi, errMessage } from "../services";
import { useAuth } from "../contexts/AuthContext";
import AppShell from "../components/layout/AppShell";
import Icon from "../components/Icon";
import Spinner, { LoadingBlock } from "../components/Spinner";
import Pagination from "../components/Pagination";
import { PAGE_SIZE_OPTIONS } from "../utils/pagination";
import { useToast } from "../contexts/ToastContext";
import PersonLink from "../components/PersonLink";
import { useConfirm } from "../contexts/ConfirmContext";
import { colorFor, initials } from "../utils/text";
import useDebounced from "../hooks/useDebounced";
import useLatestRequest from "../hooks/useLatestRequest";
import useModalChrome from "../hooks/useModalChrome";

const ROLE_LABEL = { coordinator: "Coordinator", member: "Member" };
const PAST_LABEL = { left: "Left", removed: "Removed", rejected: "Rejected" };
const YEAR_LABEL = {
   1: "1st yr",
   2: "2nd yr",
   3: "3rd yr",
   4: "4th yr",
   postgrad: "PG",
};
function fmtDate(d) {
   if (!d) return "—";
   return new Date(d).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
   });
}
function deptYear(row) {
   return (
      [row.department, row.year && YEAR_LABEL[row.year]]
         .filter(Boolean)
         .join(" · ") || "—"
   );
}

const TABS = [
   { id: "members", label: "Members", statKey: "active" },
   { id: "requests", label: "Requests", statKey: "pending" },
   { id: "past", label: "Past members", statKey: "past" },
];

function StatCard({ tone, label, value, loading, children }) {
   return (
      <div className="mm-stat">
         <div className={`mm-stat-ic ${tone}`}>{children}</div>
         <div>
            <div className="mm-stat-label">{label}</div>
            <div className="mm-stat-value">
               {loading ? <span className="skeleton mm-stat-skel" /> : value}
            </div>
         </div>
      </div>
   );
}

// Down-chevron data-URI tinted to the role's colour (mirrors the club status pill).
function chevronBg(color) {
   const c = color.replace("#", "%23");
   return `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='${c}' stroke-width='2.8' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>")`;
}

// Role badge that doubles as a role switcher — a colour-coded <select> like the club
// status pill. Lists roles the viewer may assign (below their own weight, excluding
// coordinator). Coordinator rows (and viewers without members:assign-role) render a
// plain, non-interactive pill.
function RolePill({ row, roles, viewer, busy, onPick, roleBySlug }) {
   const r = roleBySlug[row.role];
   const color = r?.color || "#94a3b8";
   const name = r?.name || ROLE_LABEL[row.role] || row.role;

   const assignable = roles.filter(
      (x) =>
         x.slug !== "coordinator" &&
         x.slug !== row.role &&
         (viewer?.isSuperAdmin || x.roleWeight < (viewer?.weight ?? 0)),
   );
   // Can't re-role a member who currently outranks (or equals) the viewer's own weight.
   const outranksRow =
      viewer?.isSuperAdmin || (r?.roleWeight ?? 0) < (viewer?.weight ?? 0);
   const interactive =
      row.role !== "coordinator" &&
      viewer?.canAssignRole &&
      outranksRow &&
      assignable.length > 0;

   if (!interactive) {
      return (
         <span className="mm-pill" style={{ color, background: `${color}1f` }}>
            {name}
         </span>
      );
   }

   return (
      <select
         className="mm-role-select"
         value={row.role}
         disabled={busy}
         onChange={(e) => onPick(e.target.value)}
         aria-label="Change role"
         style={{
            color,
            backgroundColor: `${color}1f`,
            backgroundImage: chevronBg(color),
         }}
      >
         <option value={row.role}>{name}</option>
         {assignable.map((x) => (
            <option key={x.slug} value={x.slug}>
               {x.name}
            </option>
         ))}
      </select>
   );
}

// Add-member modal — search active students by name/email and add them straight to the club.
// Reuses the faculty-picker modal styling (cctl-*) so no new CSS is needed.
function AddMemberModal({ slug, onClose, onAdded }) {
   const toast = useToast();
   const confirm = useConfirm();
   const [query, setQuery] = useState("");
   const debounced = useDebounced(query.trim());
   const [results, setResults] = useState(null);
   const [busyId, setBusyId] = useState(null);
   const startRequest = useLatestRequest();


   useModalChrome(onClose);

   useEffect(() => {
      // Fetch on open (empty query → ascending opening list) and on each debounced search.
      const isCurrent = startRequest();
      clubsApi
         .searchAddableStudents(slug, debounced)
         .then((d) => {
            if (isCurrent()) setResults(d?.items || []);
         })
         .catch(() => {
            if (isCurrent()) setResults([]);
         });
   }, [slug, debounced, startRequest]);

   async function add(s) {
      const ok = await confirm({
         title: `Add ${s.name}?`,
         message: `${s.name} will be added to the club as an approved member straight away.`,
         confirmLabel: "Add member",
      });
      if (!ok) return;
      setBusyId(s.userId);
      try {
         await clubsApi.addMember(slug, s.userId);
         toast.success(`${s.name} added to the club`);
         onAdded();
         // Drop them from the local list so they can't be added twice.
         setResults((r) => (r || []).filter((x) => x.userId !== s.userId));
      } catch (err) {
         toast.error(
            errMessage(err, "Couldn't add member"),
         );
      } finally {
         setBusyId(null);
      }
   }

   return (
      <div className="fac-overlay" onClick={onClose}>
         <div className="cctl-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cctl-modal-head">
               <div className="cctl-modal-title">Add a member</div>
               <div className="cctl-modal-sub">
                  Search active students by name or email and add them straight
                  to the club — no join request needed.
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
                  placeholder="Search students by name or email…"
                  autoFocus
               />
            </div>
            <div className="cctl-picker">
               {results === null ? (
                  <LoadingBlock label="Loading students" size={20} />
               ) : results.length === 0 ? (
                  <div className="cctl-picker-empty">
                     {debounced
                        ? "No matching students to add."
                        : "No students available to add."}
                  </div>
               ) : (
                  results.map((s) => (
                     <div className="cctl-picker-row" key={s.userId}>
                        <div
                           className="cctl-av sm"
                           style={{ background: colorFor(s.name) }}
                        >
                           {initials(s.name)}
                        </div>
                        <div className="cctl-picker-meta">
                           <div className="cctl-picker-name">{s.name}</div>
                           <div className="cctl-picker-sub">{s.email}</div>
                        </div>
                        <button
                           type="button"
                           className="cctl-picker-add"
                           disabled={busyId === s.userId}
                           onClick={() => add(s)}
                        >
                           {busyId === s.userId ? <Spinner size={13} /> : "Add"}
                        </button>
                     </div>
                  ))
               )}
            </div>
            <div className="cctl-modal-foot">
               <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={onClose}
               >
                  Done
               </button>
            </div>
         </div>
      </div>
   );
}

export default function ManageMembers() {
   const { slug } = useParams();
   const { user } = useAuth();
   const toast = useToast();
   const confirm = useConfirm();
   const isSuperAdmin = user?.role === "superAdmin";

   const [club, setClub] = useState(null);
   const [clubLoaded, setClubLoaded] = useState(false);
   const [stats, setStats] = useState(null);

   const [tab, setTab] = useState("members");
   const [search, setSearch] = useState("");
   const debounced = useDebounced(search.trim());
   const [roleFilter, setRoleFilter] = useState("all");
   const [pastFilter, setPastFilter] = useState("all");
   const [page, setPage] = useState(1);
   const [perPage, setPerPage] = useState(PAGE_SIZE_OPTIONS[0]);

   const [rows, setRows] = useState(null);
   const [pagination, setPagination] = useState(null);
   const [loadedKey, setLoadedKey] = useState(null);
   const [busyId, setBusyId] = useState(null);
   const [selected, setSelected] = useState(() => new Set());
   const [adding, setAdding] = useState(false);
   const startRequest = useLatestRequest();

   // Roles — badge colours + the change-role menu.
   const [roles, setRoles] = useState([]);
   const [rolesViewer, setRolesViewer] = useState(null);
   const [rolesLoaded, setRolesLoaded] = useState(false);
   const roleBySlug = useMemo(
      () => Object.fromEntries(roles.map((r) => [r.slug, r])),
      [roles],
   );

   // Capabilities (coordinator/superAdmin hold all). moderate → approve/reject/remove + stats
   // + the Requests/Past tabs; assign-role → the role switcher on the Members tab. Either one
   // grants access; the page shows only the features each capability unlocks.
   const canModerate = isSuperAdmin || !!rolesViewer?.canModerate;
   const canAssignRole = isSuperAdmin || !!rolesViewer?.canAssignRole;

   // Load club (header + access) once.
   useEffect(() => {
      clubsApi
         .getClub(slug, { view: "summary" })
         .then((d) => setClub(d))
         .catch(() => setClub(false))
         .finally(() => setClubLoaded(true));
   }, [slug]);

   const loadStats = useCallback(() => {
      clubsApi
         .getMemberStats(slug)
         .then((d) => setStats(d))
         .catch(() => setStats(null));
   }, [slug]);
   useEffect(() => {
      // Stats endpoint is members:moderate-gated — only fetch when the viewer can moderate.
      if (canModerate) loadStats();
   }, [canModerate, loadStats]);

   const loadRoles = useCallback(() => {
      clubsApi
         .listRoles(slug)
         .then((d) => {
            setRoles(d.items || []);
            setRolesViewer(d.viewer || null);
         })
         .catch(() => {})
         .finally(() => setRolesLoaded(true));
   }, [slug]);
   useEffect(() => {
      loadRoles();
   }, [loadRoles]);

   // Reset page + selection when tab or filters change.
   const [prev, setPrev] = useState({ tab, debounced, roleFilter, pastFilter });
   if (
      prev.tab !== tab ||
      prev.debounced !== debounced ||
      prev.roleFilter !== roleFilter ||
      prev.pastFilter !== pastFilter
   ) {
      // Tabs have different columns/data — drop stale rows so we never render the
      // previous tab's records while the new query is in flight.
      if (prev.tab !== tab) setRows(null);
      setPrev({ tab, debounced, roleFilter, pastFilter });
      setPage(1);
      setSelected(new Set());
   }

   // Loading is derived from a key mismatch — avoids setState-in-effect.
   const currentKey = `${tab}|${debounced}|${roleFilter}|${pastFilter}|${page}|${perPage}`;
   const loading = loadedKey !== currentKey;

   const fetchRows = useCallback(() => {
      const isCurrent = startRequest();
      const myKey = `${tab}|${debounced}|${roleFilter}|${pastFilter}|${page}|${perPage}`;
      clubsApi
         .listMembers(slug, {
            q: debounced || undefined,
            status:
               tab === "members"
                  ? "approved"
                  : tab === "requests"
                    ? "pending"
                    : pastFilter === "all"
                      ? "past"
                      : pastFilter,
            role:
               tab === "members" && roleFilter !== "all"
                  ? roleFilter
                  : undefined,
            page,
            limit: perPage,
         })
         .then((d) => {
            if (!isCurrent()) return;
            setRows(d?.items || []);
            setPagination(d?.pagination || null);
         })
         .catch((err) => {
            if (!isCurrent()) return;
            toast.error(
               errMessage(err, "Couldn't load members"),
            );
            setRows([]);
            setPagination(null);
         })
         .finally(() => {
            if (isCurrent()) setLoadedKey(myKey);
         });
   }, [slug, tab, debounced, roleFilter, pastFilter, page, perPage, toast, startRequest]);

   useEffect(() => {
      fetchRows();
   }, [fetchRows]);

   function refresh() {
      fetchRows();
      loadStats();
   }

   const totalPages = useMemo(() => {
      if (!pagination) return 1;
      return Math.max(1, Math.ceil(pagination.total / pagination.limit));
   }, [pagination]);

   async function decide(row, approve) {
      setBusyId(row.userId);
      try {
         await clubsApi.setMemberStatus(
            slug,
            row.userId,
            approve ? "approved" : "rejected",
         );
         toast.success(
            approve
               ? `${row.name} approved & added`
               : `${row.name}'s request rejected`,
         );
         refresh();
      } catch (err) {
         toast.error(
            errMessage(err, "Couldn't update request"),
         );
      } finally {
         setBusyId(null);
      }
   }

   async function bulkDecide(approve) {
      const ids = [...selected];
      if (!ids.length) return;
      const ok = await confirm({
         title: `${approve ? "Approve" : "Reject"} ${ids.length} request${ids.length > 1 ? "s" : ""}?`,
         message: approve
            ? "Selected students will be added to the club."
            : "Selected join requests will be rejected.",
         confirmLabel: approve ? "Approve all" : "Reject all",
         danger: !approve,
      });
      if (!ok) return;
      const results = await Promise.allSettled(
         ids.map((id) =>
            clubsApi.setMemberStatus(
               slug,
               id,
               approve ? "approved" : "rejected",
            ),
         ),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed) toast.error(`${failed} couldn't be updated`);
      else
         toast.success(
            `${ids.length} request${ids.length > 1 ? "s" : ""} ${approve ? "approved" : "rejected"}`,
         );
      setSelected(new Set());
      refresh();
   }

   async function removeMember(row) {
      const ok = await confirm({
         title: `Remove ${row.name}?`,
         message:
            "They'll be removed from the club. This is logged to the audit trail.",
         confirmLabel: "Remove",
         danger: true,
      });
      if (!ok) return;
      setBusyId(row.userId);
      try {
         await clubsApi.removeMember(slug, row.userId);
         toast.success(`${row.name} removed · logged`);
         refresh();
      } catch (err) {
         toast.error(
            errMessage(err, "Couldn't remove member"),
         );
      } finally {
         setBusyId(null);
      }
   }

   async function changeRole(row, roleSlug) {
      if (roleSlug === row.role) return;
      setBusyId(row.userId);
      try {
         await clubsApi.setMemberRole(slug, row.userId, roleSlug);
         toast.success(`${row.name} is now ${roleBySlug[roleSlug]?.name || roleSlug}`);
         // Rows only — no stat this page shows can change on a role swap.
         fetchRows();
      } catch (err) {
         toast.error(
            errMessage(err, "Couldn't change role"),
         );
      } finally {
         setBusyId(null);
      }
   }

   function toggleSelect(id) {
      setSelected((s) => {
         const next = new Set(s);
         if (next.has(id)) next.delete(id);
         else next.add(id);
         return next;
      });
   }

   // ---- access ----
   if (!clubLoaded || !rolesLoaded) {
      return (
         <AppShell title="Members" subtitle={club?.name}>
            <div className="main mm-main">
               <LoadingBlock label="Loading" size={24} />
            </div>
         </AppShell>
      );
   }
   if (!club) {
      return (
         <AppShell title="Members" subtitle={club?.name}>
            <div className="main mm-main">
               <div className="profile-empty">Club not found.</div>
            </div>
         </AppShell>
      );
   }
   // Permission-based: members:moderate OR members:assign-role grants access (coordinator/
   // superAdmin hold both). Moderation-only features are hidden below for assign-role-only users.
   // A student with no role in this club has nothing to manage here — send them to the
   // club's own page rather than rendering the chrome around a refusal.
   if (!canModerate && !canAssignRole) return <Navigate to={`/clubs/${slug}`} replace />;

   const items = rows || [];

   return (
      <AppShell title="Members" subtitle={club?.name}>
         <div className="main mm-main">
            <h1 className="mm-title">Manage members</h1>
            <p className="mm-sub">
               {canModerate
                  ? "Review join requests, manage current members, and audit who left or was removed."
                  : "Assign roles to current members."}
            </p>

            {/* STAT STRIP — needs members:moderate (the stats endpoint is moderate-gated). */}
            {canModerate && (
            <div className="mm-stat-row">
               <StatCard
                  tone="purple"
                  label="Active members"
                  value={stats?.active}
                  loading={!stats}
               >
                  <Icon size={19} strokeWidth={2.2}>
                     <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                     <circle cx="9" cy="7" r="4" />
                     <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  </Icon>
               </StatCard>
               <StatCard
                  tone="orange"
                  label="Pending requests"
                  value={stats?.pending}
                  loading={!stats}
               >
                  <Icon size={19} strokeWidth={2.2}>
                     <path d="M12 6v6l4 2" />
                     <circle cx="12" cy="12" r="10" />
                  </Icon>
               </StatCard>
               <StatCard
                  tone="green"
                  label="Coordinators"
                  value={stats?.coordinators}
                  loading={!stats}
               >
                  <Icon size={19} strokeWidth={2.2}>
                     <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                     <circle cx="9" cy="7" r="4" />
                     <path d="M19 8v6M22 11h-6" />
                  </Icon>
               </StatCard>
               <StatCard
                  tone="gray"
                  label="Left / removed"
                  value={stats?.past}
                  loading={!stats}
               >
                  <Icon size={19} strokeWidth={2.2}>
                     <path d="M16 17l5-5-5-5" />
                     <path d="M21 12H9" />
                     <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  </Icon>
               </StatCard>
            </div>
            )}

            {/* TABS — Requests/Past are moderation-only; assign-role-only sees just Members. */}
            <div className="mm-tabs">
               {(canModerate
                  ? TABS
                  : TABS.filter((t) => t.id === "members")
               ).map((t) => (
                  <button
                     key={t.id}
                     type="button"
                     className={`mm-tab${tab === t.id ? " active" : ""}`}
                     onClick={() => setTab(t.id)}
                  >
                     {t.label}
                     {canModerate && (
                        <span
                           className={`mm-badge${t.id === "requests" && stats?.pending ? " alert" : ""}`}
                        >
                           {stats ? stats[t.statKey] : "—"}
                        </span>
                     )}
                  </button>
               ))}
            </div>

            {/* TOOLBAR */}
            <div className="mm-toolbar">
               <div className="mm-search">
                  <Icon size={15} strokeWidth={2.2}>
                     <circle cx="11" cy="11" r="8" />
                     <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </Icon>
                  <input
                     value={search}
                     onChange={(e) => setSearch(e.target.value)}
                     placeholder={
                        tab === "requests"
                           ? "Search requests…"
                           : tab === "past"
                             ? "Search past members…"
                             : "Search members by name…"
                     }
                  />
               </div>
               {tab === "members" && (
                  <div className="mm-seg">
                     {[
                        { id: "all", label: "All" },
                        { id: "coordinator", label: "Coordinators" },
                        { id: "member", label: "Members" },
                     ].map((f) => (
                        <button
                           key={f.id}
                           type="button"
                           className={roleFilter === f.id ? "active" : ""}
                           onClick={() => setRoleFilter(f.id)}
                        >
                           {f.label}
                        </button>
                     ))}
                  </div>
               )}
               {tab === "past" && (
                  <div className="mm-seg">
                     {[
                        { id: "all", label: "All" },
                        { id: "left", label: "Left" },
                        { id: "removed", label: "Removed" },
                        { id: "rejected", label: "Rejected" },
                     ].map((f) => (
                        <button
                           key={f.id}
                           type="button"
                           className={pastFilter === f.id ? "active" : ""}
                           onClick={() => setPastFilter(f.id)}
                        >
                           {f.label}
                        </button>
                     ))}
                  </div>
               )}
               {canModerate && (
                  <button
                     type="button"
                     className="btn btn-primary"
                     style={{ marginLeft: "auto" }}
                     onClick={() => setAdding(true)}
                  >
                     <Icon size={14} strokeWidth={2.5}>
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                     </Icon>
                     Add member
                  </button>
               )}
            </div>

            {/* BULK BAR (requests) */}
            {tab === "requests" && selected.size > 0 && (
               <div className="mm-bulk">
                  <span className="count">{selected.size} selected</span>
                  <div className="spacer" />
                  <button
                     type="button"
                     className="b-approve"
                     onClick={() => bulkDecide(true)}
                  >
                     ✓ Approve selected
                  </button>
                  <button
                     type="button"
                     className="b-reject"
                     onClick={() => bulkDecide(false)}
                  >
                     Reject
                  </button>
                  <button
                     type="button"
                     className="b-clear"
                     onClick={() => setSelected(new Set())}
                  >
                     Clear
                  </button>
               </div>
            )}

            {/* TABLE */}
            <div className="mm-card">
               <table className={`mm-dt${loading ? " is-loading" : ""}`}>
                  <thead>
                     {tab === "members" && (
                        <tr>
                           <th>Member</th>
                           <th>Dept · Year</th>
                           <th>Role</th>
                           <th>Joined</th>
                           <th className="ta-right">Actions</th>
                        </tr>
                     )}
                     {tab === "requests" && (
                        <tr>
                           <th className="mm-check" />
                           <th>Student</th>
                           <th>Dept · Year</th>
                           <th>Requested</th>
                           <th className="ta-right">Decision</th>
                        </tr>
                     )}
                     {tab === "past" && (
                        <tr>
                           <th>Member</th>
                           <th>Dept · Year</th>
                           <th>Status</th>
                           <th>Left / removed</th>
                           <th>By whom</th>
                        </tr>
                     )}
                  </thead>
                  <tbody>
                     {loading && !rows ? (
                        <tr>
                           <td colSpan={6}>
                              <LoadingBlock label="Loading" size={22} />
                           </td>
                        </tr>
                     ) : items.length === 0 ? (
                        <tr>
                           <td colSpan={6}>
                              <div className="mm-empty">
                                 <div className="t">
                                    {tab === "requests"
                                       ? "All caught up"
                                       : "Nothing here"}
                                 </div>
                                 <div className="s">
                                    {tab === "requests"
                                       ? "No pending join requests right now."
                                       : "No records match your search or filter."}
                                 </div>
                              </div>
                           </td>
                        </tr>
                     ) : (
                        items.map((row) => {
                           const av = (
                              <div className="mm-cell">
                                 <div
                                    className="mm-avatar"
                                    style={{ background: colorFor(row.name) }}
                                 >
                                    {initials(row.name)}
                                 </div>
                                 <div>
                                    <PersonLink user={row} className="mm-name" />
                                    {row.email && (
                                       <div className="mm-email">
                                          {row.email}
                                       </div>
                                    )}
                                 </div>
                              </div>
                           );
                           if (tab === "members") {
                              // Mirror the backend weight bound: only show remove for members
                              // ranked below the viewer's role (superAdmin/coordinator unbounded).
                              const targetWeight =
                                 roleBySlug[row.role]?.roleWeight ?? 0;
                              const canRemoveRow =
                                 rolesViewer?.isSuperAdmin ||
                                 (rolesViewer?.canModerate &&
                                    targetWeight < (rolesViewer?.weight ?? 0));
                              return (
                                 <tr key={row.userId}>
                                    <td>{av}</td>
                                    <td>
                                       <span className="mm-dept">
                                          {deptYear(row)}
                                       </span>
                                    </td>
                                    <td>
                                       <RolePill
                                          row={row}
                                          roles={roles}
                                          viewer={rolesViewer}
                                          roleBySlug={roleBySlug}
                                          busy={busyId === row.userId}
                                          onPick={(s) => changeRole(row, s)}
                                       />
                                    </td>
                                    <td>
                                       <span className="mm-date">
                                          {fmtDate(row.joinedAt)}
                                       </span>
                                    </td>
                                    <td>
                                       <div className="mm-actions">
                                          {row.role === "coordinator" ||
                                          !canRemoveRow ? (
                                             <span
                                                className="mm-locked"
                                                title={
                                                   row.role === "coordinator"
                                                      ? "Coordinators are managed from Club Controls"
                                                      : "You can only remove members ranked below your role"
                                                }
                                             >
                                                —
                                             </span>
                                          ) : busyId === row.userId ? (
                                             <Spinner size={15} />
                                          ) : (
                                             <button
                                                type="button"
                                                className="mm-icon danger"
                                                title="Remove member"
                                                onClick={() =>
                                                   removeMember(row)
                                                }
                                             >
                                                <Icon
                                                   size={15}
                                                   strokeWidth={2.2}
                                                >
                                                   <path d="M16 17l5-5-5-5" />
                                                   <path d="M21 12H9" />
                                                   <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                                                </Icon>
                                             </button>
                                          )}
                                       </div>
                                    </td>
                                 </tr>
                              );
                           }
                           if (tab === "requests") {
                              return (
                                 <tr key={row.userId}>
                                    <td className="mm-check">
                                       <button
                                          type="button"
                                          className={`mm-ckbox${selected.has(row.userId) ? " checked" : ""}`}
                                          onClick={() =>
                                             toggleSelect(row.userId)
                                          }
                                          aria-label="Select request"
                                       >
                                          <Icon size={11} strokeWidth={3.5}>
                                             <polyline points="20 6 9 17 4 12" />
                                          </Icon>
                                       </button>
                                    </td>
                                    <td>{av}</td>
                                    <td>
                                       <span className="mm-dept">
                                          {deptYear(row)}
                                       </span>
                                    </td>
                                    <td>
                                       <span className="mm-date">
                                          {fmtDate(row.createdAt)}
                                       </span>
                                    </td>
                                    <td>
                                       <div className="mm-actions">
                                          {busyId === row.userId ? (
                                             <Spinner size={15} />
                                          ) : (
                                             <>
                                                <button
                                                   type="button"
                                                   className="mm-btn approve"
                                                   onClick={() =>
                                                      decide(row, true)
                                                   }
                                                >
                                                   <Icon
                                                      size={12}
                                                      strokeWidth={3}
                                                   >
                                                      <polyline points="20 6 9 17 4 12" />
                                                   </Icon>
                                                   Approve
                                                </button>
                                                <button
                                                   type="button"
                                                   className="mm-btn reject"
                                                   onClick={() =>
                                                      decide(row, false)
                                                   }
                                                >
                                                   Reject
                                                </button>
                                             </>
                                          )}
                                       </div>
                                    </td>
                                 </tr>
                              );
                           }
                           // past
                           const by = row.removedBy?.name || "Self";
                           return (
                              <tr key={row.userId}>
                                 <td>{av}</td>
                                 <td>
                                    <span className="mm-dept">
                                       {deptYear(row)}
                                    </span>
                                 </td>
                                 <td>
                                    <span className={`mm-pill ${row.status}`}>
                                       <span className="dot" />
                                       {PAST_LABEL[row.status] || row.status}
                                    </span>
                                 </td>
                                 <td>
                                    <span className="mm-date">
                                       {fmtDate(row.leftAt)}
                                    </span>
                                 </td>
                                 <td>
                                    <span
                                       className={
                                          row.removedBy
                                             ? "mm-by"
                                             : "mm-by muted"
                                       }
                                    >
                                       {by}
                                    </span>
                                 </td>
                              </tr>
                           );
                        })
                     )}
                  </tbody>
               </table>

               {items.length > 0 && (
                  <div className="mm-foot">
                     <Pagination
                        page={page}
                        totalPages={totalPages}
                        perPage={perPage}
                        perPageOptions={PAGE_SIZE_OPTIONS}
                        onPerPageChange={(n) => {
                           setPerPage(n);
                           setPage(1);
                        }}
                        hasMore={pagination?.hasMore}
                        onChange={setPage}
                     />
                  </div>
               )}
            </div>

            {adding && (
               <AddMemberModal
                  slug={slug}
                  onClose={() => setAdding(false)}
                  onAdded={refresh}
               />
            )}
         </div>
      </AppShell>
   );
}
