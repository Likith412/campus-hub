import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { clubsApi, ApiError } from "../services";
import { useAuth } from "../contexts/AuthContext";
import AppShell from "../components/layout/AppShell";
import Icon from "../components/Icon";
import Spinner, { LoadingBlock } from "../components/Spinner";
import Pagination from "../components/Pagination";
import { useToast } from "../contexts/ToastContext";
import { useConfirm } from "../contexts/ConfirmContext";

const PAGE_SIZE = 12;
const ROLE_LABEL = { coordinator: "Coordinator", member: "Member" };
const PAST_LABEL = { left: "Left", removed: "Removed", rejected: "Rejected" };
const YEAR_LABEL = {
   1: "1st yr",
   2: "2nd yr",
   3: "3rd yr",
   4: "4th yr",
   postgrad: "PG",
};
const AVATAR_COLORS = [
   "#6c63ff",
   "#34d399",
   "#f59e0b",
   "#3b82f6",
   "#ef4444",
   "#a855f7",
   "#06b6d4",
   "#ec4899",
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
   const [debounced, setDebounced] = useState("");
   const [roleFilter, setRoleFilter] = useState("all");
   const [pastFilter, setPastFilter] = useState("all");
   const [page, setPage] = useState(1);

   const [rows, setRows] = useState(null);
   const [pagination, setPagination] = useState(null);
   const [loadedKey, setLoadedKey] = useState(null);
   const [busyId, setBusyId] = useState(null);
   const [selected, setSelected] = useState(() => new Set());
   const reqRef = useRef(0);

   useEffect(() => {
      const id = setTimeout(() => setDebounced(search.trim()), 300);
      return () => clearTimeout(id);
   }, [search]);

   // Load club (header + access) once.
   useEffect(() => {
      clubsApi
         .getClub(slug)
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
      loadStats();
   }, [loadStats]);

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
   const currentKey = `${tab}|${debounced}|${roleFilter}|${pastFilter}|${page}`;
   const loading = loadedKey !== currentKey;

   const fetchRows = useCallback(() => {
      const myReq = ++reqRef.current;
      const myKey = `${tab}|${debounced}|${roleFilter}|${pastFilter}|${page}`;
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
            limit: PAGE_SIZE,
         })
         .then((d) => {
            if (myReq !== reqRef.current) return;
            setRows(d?.items || []);
            setPagination(d?.pagination || null);
         })
         .catch((err) => {
            if (myReq !== reqRef.current) return;
            toast.error(
               err instanceof ApiError ? err.message : "Couldn't load members",
            );
            setRows([]);
            setPagination(null);
         })
         .finally(() => {
            if (myReq === reqRef.current) setLoadedKey(myKey);
         });
   }, [slug, tab, debounced, roleFilter, pastFilter, page, toast]);

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
            err instanceof ApiError ? err.message : "Couldn't update request",
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
            err instanceof ApiError ? err.message : "Couldn't remove member",
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
   if (!clubLoaded) {
      return (
         <AppShell title="Members">
            <div className="main mm-main">
               <LoadingBlock label="Loading" size={24} />
            </div>
         </AppShell>
      );
   }
   if (!club) {
      return (
         <AppShell title="Members">
            <div className="main mm-main">
               <div className="profile-empty">Club not found.</div>
            </div>
         </AppShell>
      );
   }
   const isClubCoordinator =
      club.membership?.role === "coordinator" &&
      club.membership?.status === "approved";
   if (!isSuperAdmin && !isClubCoordinator) {
      return (
         <AppShell title="Members">
            <div className="main mm-main">
               <div className="profile-empty">
                  You can only manage members of clubs you coordinate.
               </div>
            </div>
         </AppShell>
      );
   }

   const items = rows || [];

   return (
      <AppShell title="Members">
         <div className="main mm-main">
            <div className="breadcrumb">
               <Link to={`/clubs/${slug}`}>{club.name}</Link>
               <span className="sep">›</span>
               <span className="now">Members</span>
            </div>
            <h1 className="mm-title">Manage members</h1>
            <p className="mm-sub">
               Review join requests, manage current members, and audit who left
               or was removed.
            </p>

            {/* STAT STRIP */}
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

            {/* TABS */}
            <div className="mm-tabs">
               {TABS.map((t) => (
                  <button
                     key={t.id}
                     type="button"
                     className={`mm-tab${tab === t.id ? " active" : ""}`}
                     onClick={() => setTab(t.id)}
                  >
                     {t.label}
                     <span
                        className={`mm-badge${t.id === "requests" && stats?.pending ? " alert" : ""}`}
                     >
                        {stats ? stats[t.statKey] : "—"}
                     </span>
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
                           <th>Engagement</th>
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
                                    {row.avatarUrl ? (
                                       <img src={row.avatarUrl} alt="" />
                                    ) : (
                                       initials(row.name)
                                    )}
                                 </div>
                                 <div>
                                    <div className="mm-name">{row.name}</div>
                                    {row.email && (
                                       <div className="mm-email">
                                          {row.email}
                                       </div>
                                    )}
                                 </div>
                              </div>
                           );
                           if (tab === "members") {
                              const eng = row.engagementScore || 0;
                              const engColor =
                                 eng >= 60
                                    ? "var(--accent-green)"
                                    : eng >= 35
                                      ? "var(--accent-orange)"
                                      : "var(--accent-red)";
                              return (
                                 <tr key={row.userId}>
                                    <td>{av}</td>
                                    <td>
                                       <span className="mm-dept">
                                          {deptYear(row)}
                                       </span>
                                    </td>
                                    <td>
                                       <span className={`mm-pill ${row.role}`}>
                                          <span className="dot" />
                                          {ROLE_LABEL[row.role] || row.role}
                                       </span>
                                    </td>
                                    <td>
                                       <span className="mm-date">
                                          {fmtDate(row.joinedAt)}
                                       </span>
                                    </td>
                                    <td>
                                       <span
                                          className="mm-eng"
                                          style={{ color: engColor }}
                                       >
                                          {eng}
                                       </span>
                                    </td>
                                    <td>
                                       <div className="mm-actions">
                                          {row.role === "coordinator" ? (
                                             <span
                                                className="mm-locked"
                                                title="Coordinators are managed from Club Controls"
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

               {items.length > 0 && totalPages > 1 && (
                  <div className="mm-foot">
                     <Pagination
                        page={page}
                        totalPages={totalPages}
                        perPage={PAGE_SIZE}
                        hasMore={pagination?.hasMore}
                        onChange={setPage}
                     />
                  </div>
               )}
            </div>
         </div>
      </AppShell>
   );
}
