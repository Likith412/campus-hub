// All Students — /admin/students, superAdmin only. Same shape as the Faculty page:
// headline counts, search + status filter + sort, then the shared data table.
// Read-only apart from activating/deactivating an account; students sign themselves up,
// so there's no "create" action here.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import PersonLink from "../components/PersonLink";
import { adminApi, ApiError } from "../services";
import AppShell from "../components/layout/AppShell";
import Icon from "../components/Icon";
import Spinner, { LoadingBlock } from "../components/Spinner";
import { useToast } from "../contexts/ToastContext";
import { useConfirm } from "../contexts/ConfirmContext";
import { initials } from "../utils/text";
import useDebounced from "../hooks/useDebounced";
import useLatestRequest from "../hooks/useLatestRequest";
import SearchField from "../components/SearchField";
import FilterSelect from "../components/FilterSelect";

const PAGE_SIZE = 8;
const FILTER_TABS = [
   { id: "all", label: "All" },
   { id: "active", label: "Active" },
   { id: "inactive", label: "Inactive" },
   { id: "pending", label: "Pending" },
];
const SORTS = [
   { id: "new", label: "Newest" },
   { id: "name", label: "Name (A–Z)" },
   { id: "clubs", label: "Most clubs" },
];

const AVATAR_COLORS = [
   "#6c63ff", "#34d399", "#f59e0b", "#3b82f6",
   "#ef4444", "#a855f7", "#06b6d4", "#ec4899",
];
function colorFor(s = "") {
   let h = 0;
   for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
   return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function formatDate(d) {
   if (!d) return "—";
   return new Date(d).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
   });
}
function timeAgo(d) {
   if (!d) return "Never";
   const diff = Date.now() - new Date(d).getTime();
   const m = 60000, h = 3600000, day = 86400000;
   if (diff < m) return "Just now";
   if (diff < h) return `${Math.floor(diff / m)} min ago`;
   if (diff < day) return `${Math.floor(diff / h)} hr ago`;
   if (diff < 7 * day) return `${Math.floor(diff / day)} days ago`;
   return formatDate(d);
}

function StatCard({ tone, label, value, loading, children }) {
   return (
      <div className="fac-stat">
         <div className={`fac-stat-ic ${tone}`}>{children}</div>
         <div>
            <div className="fac-stat-label">{label}</div>
            <div className="fac-stat-value">
               {loading ? <span className="skeleton fac-stat-skel" /> : value}
            </div>
         </div>
      </div>
   );
}

export default function AllStudents() {
   const toast = useToast();
   const confirm = useConfirm();

   const [search, setSearch] = useState("");
   const debounced = useDebounced(search.trim());
   const [filter, setFilter] = useState("all");
   const [sort, setSort] = useState("new");
   const [page, setPage] = useState(1);
   const [data, setData] = useState(null);
   const [loadedKey, setLoadedKey] = useState(null);
   const [busyId, setBusyId] = useState(null);
   const [stats, setStats] = useState(null);
   const startRequest = useLatestRequest();

   const currentKey = `${debounced}|${filter}|${sort}|${page}`;
   const loading = loadedKey !== currentKey;


   // Reset to page 1 when filters change.
   const [prevFilters, setPrevFilters] = useState({ debounced, filter, sort });
   if (
      prevFilters.debounced !== debounced ||
      prevFilters.filter !== filter ||
      prevFilters.sort !== sort
   ) {
      setPrevFilters({ debounced, filter, sort });
      setPage(1);
   }

   const fetchStats = useCallback(() => {
      adminApi.getStudentStats().then(setStats).catch(() => {});
   }, []);

   const fetchStudents = useCallback(() => {
      const isCurrent = startRequest();
      const myKey = `${debounced}|${filter}|${sort}|${page}`;
      adminApi
         .listUsers({
            role: "student",
            q: debounced || undefined,
            status: filter === "all" ? undefined : filter,
            sort,
            page,
            limit: PAGE_SIZE,
         })
         .then((d) => {
            if (!isCurrent()) return;
            setData(d);
         })
         .catch((err) => {
            if (!isCurrent()) return;
            toast.error(
               err instanceof ApiError ? err.message : "Couldn't load students",
            );
            setData({
               items: [],
               pagination: { page, limit: PAGE_SIZE, total: 0, hasMore: false },
            });
         })
         .finally(() => {
            if (isCurrent()) setLoadedKey(myKey);
         });
   }, [debounced, filter, sort, page, toast, startRequest]);

   useEffect(() => {
      fetchStats();
   }, [fetchStats]);
   useEffect(() => {
      fetchStudents();
   }, [fetchStudents]);

   async function toggleActive(user) {
      const deactivating = user.isActive;
      const ok = await confirm({
         title: deactivating
            ? `Deactivate ${user.name}?`
            : `Reactivate ${user.name}?`,
         message: deactivating
            ? "They won't be able to log in until reactivated. Their clubs and registrations are kept."
            : "They'll be able to log in again.",
         confirmLabel: deactivating ? "Deactivate" : "Reactivate",
         danger: deactivating,
      });
      if (!ok) return;
      setBusyId(user.id);
      try {
         await adminApi.setUserActive(user.id, !user.isActive);
         setData((d) =>
            d
               ? {
                    ...d,
                    items: d.items.map((u) =>
                       u.id === user.id ? { ...u, isActive: !u.isActive } : u,
                    ),
                 }
               : d,
         );
         fetchStats();
         toast.success(
            deactivating ? "Account deactivated" : "Account reactivated",
         );
      } catch (err) {
         toast.error(
            err instanceof ApiError ? err.message : "Couldn't update account",
         );
      } finally {
         setBusyId(null);
      }
   }

   const items = data?.items || [];
   const pagination = data?.pagination;
   const totalPages = useMemo(
      () => Math.max(1, Math.ceil((pagination?.total || 0) / PAGE_SIZE)),
      [pagination],
   );
   const rangeStart = pagination?.total ? (page - 1) * PAGE_SIZE + 1 : 0;
   const rangeEnd = (page - 1) * PAGE_SIZE + items.length;
   const showEmpty = !loading && items.length === 0;

   return (
      <AppShell title="All Students">
         <div className="main faculty-page">
            <div className="fac-pagehead">
               <h1 className="fac-page-title">All Students</h1>
               <p className="fac-page-sub">
                  Every student account on the platform. Students sign themselves up —
                  deactivate one to block access without losing their{" "}
                  <Link to="/admin/clubs" className="fac-inline-link">
                     club memberships
                  </Link>{" "}
                  or registrations.
               </p>
            </div>

            <div className="fac-stat-row">
               <StatCard
                  tone="purple"
                  label="Total students"
                  value={stats?.total}
                  loading={!stats}
               >
                  <Icon size={20} strokeWidth={2.2}>
                     <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                     <path d="M6 12v5c3 3 9 3 12 0v-5" />
                  </Icon>
               </StatCard>
               <StatCard
                  tone="green"
                  label="Active"
                  value={stats?.active}
                  loading={!stats}
               >
                  <Icon size={20} strokeWidth={2.2}>
                     <path d="M9 12l2 2 4-4" />
                     <circle cx="12" cy="12" r="10" />
                  </Icon>
               </StatCard>
               <StatCard
                  tone="orange"
                  label="Pending first login"
                  value={stats?.pending}
                  loading={!stats}
               >
                  <Icon size={20} strokeWidth={2.2}>
                     <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                     <polyline points="22,6 12,13 2,6" />
                  </Icon>
               </StatCard>
               <StatCard
                  tone="blue"
                  label="In at least one club"
                  value={stats?.inClubs}
                  loading={!stats}
               >
                  <Icon size={20} strokeWidth={2.2}>
                     <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                     <circle cx="9" cy="7" r="4" />
                     <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  </Icon>
               </StatCard>
            </div>

            <div className="fac-toolbar">
               <SearchField
                  placeholder="Search by name or email…"
                  value={search}
                  onChange={setSearch}
               />
               <div className="fac-tabs">
                  {FILTER_TABS.map((t) => (
                     <button
                        type="button"
                        key={t.id}
                        className={filter === t.id ? "active" : ""}
                        onClick={() => setFilter(t.id)}
                     >
                        {t.label}
                     </button>
                  ))}
               </div>
               <FilterSelect
                  label="Sort"
                  value={sort}
                  onChange={setSort}
                  options={SORTS}
                  ariaLabel="Sort students"
                  withIcon
               />
            </div>

            <div className="fac-table-card">
               {loading && !data ? (
                  <LoadingBlock label="Loading students" size={24} />
               ) : showEmpty ? (
                  <div className="profile-empty">
                     No students match your search.
                  </div>
               ) : (
                  <>
                     <table className={`fac-dt${loading ? " is-refetching" : ""}`}>
                        <thead>
                           <tr>
                              <th>Student</th>
                              <th>Clubs</th>
                              <th>Joined</th>
                              <th>Last active</th>
                              <th>Active</th>
                           </tr>
                        </thead>
                        <tbody>
                           {items.map((u) => (
                              <tr key={u.id} className={u.isActive ? "" : "inactive"}>
                                 <td>
                                    <div className="fac-cell">
                                       <div
                                          className="fac-avatar"
                                          style={{ background: colorFor(u.name) }}
                                       >
                                          {initials(u.name)}
                                       </div>
                                       <div>
                                          <PersonLink user={u} className="fac-name" />
                                          <div className="fac-email">{u.email}</div>
                                       </div>
                                    </div>
                                 </td>
                                 <td>
                                    <span
                                       className={`fac-clubs${u.clubCount === 0 ? " zero" : ""}`}
                                    >
                                       {u.clubCount} club{u.clubCount === 1 ? "" : "s"}
                                    </span>
                                 </td>
                                 <td>
                                    <span className="fac-date">
                                       {formatDate(u.createdAt)}
                                    </span>
                                 </td>
                                 <td>
                                    <span className="fac-date">
                                       {timeAgo(u.lastLoginAt)}
                                    </span>
                                 </td>
                                 <td>
                                    <div className="fac-row-actions">
                                       {busyId === u.id ? (
                                          <Spinner size={16} />
                                       ) : (
                                          <button
                                             type="button"
                                             className={`fac-toggle${u.isActive ? "" : " off"}`}
                                             onClick={() => toggleActive(u)}
                                             title={
                                                u.isActive ? "Deactivate" : "Reactivate"
                                             }
                                             aria-label={
                                                u.isActive ? "Deactivate" : "Reactivate"
                                             }
                                          />
                                       )}
                                    </div>
                                 </td>
                              </tr>
                           ))}
                        </tbody>
                     </table>

                     <div className="fac-table-foot">
                        <div className="fac-page-info">
                           Showing{" "}
                           <b>
                              {rangeStart}–{rangeEnd}
                           </b>{" "}
                           of <b>{pagination?.total ?? 0}</b>
                        </div>
                        <div className="fac-page-ctrl">
                           <button
                              type="button"
                              className="fac-pg"
                              disabled={page <= 1}
                              onClick={() => setPage((p) => Math.max(1, p - 1))}
                           >
                              ‹ Prev
                           </button>
                           {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                              (n) => (
                                 <button
                                    type="button"
                                    key={n}
                                    className={`fac-pg${n === page ? " active" : ""}`}
                                    onClick={() => setPage(n)}
                                 >
                                    {n}
                                 </button>
                              ),
                           )}
                           <button
                              type="button"
                              className="fac-pg"
                              disabled={page >= totalPages}
                              onClick={() =>
                                 setPage((p) => Math.min(totalPages, p + 1))
                              }
                           >
                              Next ›
                           </button>
                        </div>
                     </div>
                  </>
               )}
            </div>
         </div>
      </AppShell>
   );
}
