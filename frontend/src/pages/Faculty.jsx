import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { adminApi, ApiError } from "../services";
import AppShell from "../components/layout/AppShell";
import Icon from "../components/Icon";
import Spinner, { LoadingBlock } from "../components/Spinner";
import { useToast } from "../contexts/ToastContext";
import { useConfirm } from "../contexts/ConfirmContext";

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

// Deterministic avatar color from the name (mirrors the design mockup).
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

// Create-faculty dialog: form → one-time credentials view.
function CreateFacultyModal({ onClose, onCreated }) {
   const toast = useToast();
   const [name, setName] = useState("");
   const [email, setEmail] = useState("");
   const [busy, setBusy] = useState(false);
   const [error, setError] = useState(null);
   const [created, setCreated] = useState(null);

   useEffect(() => {
      const onKey = (e) => {
         if (e.key === "Escape" && !busy) onClose();
      };
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", onKey);
      return () => {
         document.body.style.overflow = prev;
         window.removeEventListener("keydown", onKey);
      };
   }, [busy, onClose]);

   async function handleSubmit(e) {
      e.preventDefault();
      setError(null);
      setBusy(true);
      try {
         const res = await adminApi.createFaculty({
            name: name.trim(),
            email: email.trim(),
         });
         setCreated(res);
         onCreated();
      } catch (err) {
         setError(err instanceof ApiError ? err.message : "Couldn't create account");
      } finally {
         setBusy(false);
      }
   }

   function reset() {
      setCreated(null);
      setName("");
      setEmail("");
      setError(null);
   }

   function copyPassword() {
      navigator.clipboard?.writeText(created.tempPassword).then(
         () => toast.success("Password copied to clipboard"),
         () => toast.error("Copy failed — select it manually"),
      );
   }

   return (
      <div className="fac-overlay" onClick={() => !busy && onClose()}>
         <div
            className="fac-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
         >
            {!created ? (
               <form onSubmit={handleSubmit}>
                  <div className="fac-modal-head">
                     <div className="fac-modal-icon">
                        <Icon size={20} strokeWidth={2.2}>
                           <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                           <circle cx="9" cy="7" r="4" />
                           <line x1="19" y1="8" x2="19" y2="14" />
                           <line x1="22" y1="11" x2="16" y2="11" />
                        </Icon>
                     </div>
                     <div className="fac-modal-title">Create faculty account</div>
                     <div className="fac-modal-sub">
                        We'll generate a password and email it with login
                        instructions. The faculty member can change it after first
                        sign-in.
                     </div>
                  </div>
                  <div className="fac-modal-body">
                     <div className="fac-modal-field">
                        <label className="fac-modal-label">Full name</label>
                        <input
                           className="fac-modal-input"
                           value={name}
                           onChange={(e) => setName(e.target.value)}
                           placeholder="e.g. Dr. Anjali Verma"
                           autoFocus
                           required
                           minLength={2}
                        />
                     </div>
                     <div className="fac-modal-field">
                        <label className="fac-modal-label">
                           Institutional email
                        </label>
                        <input
                           className={`fac-modal-input${error ? " error" : ""}`}
                           type="email"
                           value={email}
                           onChange={(e) => setEmail(e.target.value)}
                           placeholder="anjali.v@college.edu"
                           required
                        />
                        <div className={`fac-modal-help${error ? " err" : ""}`}>
                           {error ||
                              "A faculty account & verified email will be created for this address."}
                        </div>
                     </div>
                     <div className="fac-modal-note">
                        <Icon size={15} strokeWidth={2.2}>
                           <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        </Icon>
                        <span>
                           Role is set to <b>Faculty</b>. Email is pre-verified,
                           no OTP needed. The generated password is shown once and
                           emailed — store it safely.
                        </span>
                     </div>
                  </div>
                  <div className="fac-modal-foot">
                     <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={onClose}
                        disabled={busy}
                     >
                        Cancel
                     </button>
                     <button type="submit" className="btn btn-primary" disabled={busy}>
                        {busy ? <Spinner size={15} /> : "Create & send email"}
                     </button>
                  </div>
               </form>
            ) : (
               <div className="fac-modal-success">
                  <div className="fac-success-ring">
                     <Icon size={30} strokeWidth={3}>
                        <polyline points="20 6 9 17 4 12" />
                     </Icon>
                  </div>
                  <h3>Faculty account created</h3>
                  <p>
                     An email with login details has been sent to{" "}
                     <b>{created.user.name.split(" ")[0]}</b>.
                  </p>
                  <div className="fac-cred-box">
                     <div className="fac-cred-row">
                        <span className="fac-cred-k">Email</span>
                        <span className="fac-cred-v">{created.user.email}</span>
                     </div>
                     <div className="fac-cred-row">
                        <span className="fac-cred-k">Temp password</span>
                        <span className="fac-cred-v pw">
                           {created.tempPassword}
                           <button
                              type="button"
                              className="fac-copy"
                              onClick={copyPassword}
                              title="Copy"
                           >
                              <Icon size={14} strokeWidth={2.2}>
                                 <rect x="9" y="9" width="13" height="13" rx="2" />
                                 <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                              </Icon>
                           </button>
                        </span>
                     </div>
                  </div>
                  <div className="fac-sent-banner">
                     <Icon size={13} strokeWidth={2.4}>
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                        <polyline points="22,6 12,13 2,6" />
                     </Icon>
                     Email sent successfully
                  </div>
                  <div className="fac-success-actions">
                     <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={reset}
                     >
                        Create another
                     </button>
                     <button type="button" className="btn btn-primary" onClick={onClose}>
                        Done
                     </button>
                  </div>
               </div>
            )}
         </div>
      </div>
   );
}

export default function Faculty() {
   const toast = useToast();
   const confirm = useConfirm();

   const [search, setSearch] = useState("");
   const [debounced, setDebounced] = useState("");
   const [filter, setFilter] = useState("all");
   const [sort, setSort] = useState("new");
   const [page, setPage] = useState(1);
   const [data, setData] = useState(null);
   const [loadedKey, setLoadedKey] = useState(null);
   const [busyId, setBusyId] = useState(null);
   const [modalOpen, setModalOpen] = useState(false);
   const [stats, setStats] = useState(null);
   const reqIdRef = useRef(0);

   const currentKey = `${debounced}|${filter}|${sort}|${page}`;
   const loading = loadedKey !== currentKey;

   useEffect(() => {
      const id = setTimeout(() => setDebounced(search.trim()), 300);
      return () => clearTimeout(id);
   }, [search]);

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
      adminApi.getFacultyStats().then(setStats).catch(() => {});
   }, []);

   const fetchFaculty = useCallback(() => {
      const myReqId = ++reqIdRef.current;
      const myKey = `${debounced}|${filter}|${sort}|${page}`;
      adminApi
         .listUsers({
            role: "faculty",
            q: debounced || undefined,
            status: filter === "all" ? undefined : filter,
            sort,
            page,
            limit: PAGE_SIZE,
         })
         .then((d) => {
            if (myReqId !== reqIdRef.current) return;
            setData(d);
         })
         .catch((err) => {
            if (myReqId !== reqIdRef.current) return;
            toast.error(err instanceof ApiError ? err.message : "Couldn't load faculty");
            setData({
               items: [],
               pagination: { page, limit: PAGE_SIZE, total: 0, hasMore: false },
            });
         })
         .finally(() => {
            if (myReqId === reqIdRef.current) setLoadedKey(myKey);
         });
   }, [debounced, filter, sort, page, toast]);

   useEffect(() => {
      fetchFaculty();
   }, [fetchFaculty]);
   useEffect(() => {
      fetchStats();
   }, [fetchStats]);

   const items = data?.items || [];
   const pagination = data?.pagination;
   const totalPages = useMemo(() => {
      if (!pagination) return 1;
      return Math.max(1, Math.ceil(pagination.total / pagination.limit));
   }, [pagination]);
   const showEmpty = !loading && items.length === 0;
   const rangeStart = pagination ? (pagination.page - 1) * pagination.limit + 1 : 0;
   const rangeEnd = pagination ? rangeStart + items.length - 1 : 0;

   async function toggleActive(user) {
      const deactivating = user.isActive;
      const ok = await confirm({
         title: deactivating ? `Deactivate ${user.name}?` : `Reactivate ${user.name}?`,
         message: deactivating
            ? "They won't be able to log in until reactivated. Their clubs and data are kept."
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
         toast.success(deactivating ? "Account deactivated" : "Account reactivated");
      } catch (err) {
         toast.error(err instanceof ApiError ? err.message : "Couldn't update account");
      } finally {
         setBusyId(null);
      }
   }

   return (
      <AppShell
         title="All Faculties"
         topbarRight={
            <button
               type="button"
               className="btn btn-primary"
               onClick={() => setModalOpen(true)}
            >
               <Icon size={13} strokeWidth={2.5}>
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
               </Icon>
               Create faculty
            </button>
         }
      >
         <div className="main faculty-page">
            <div className="fac-pagehead">
               <div className="breadcrumb">
                  Institute <span className="sep">›</span>{" "}
                  <span className="now">All Faculties</span>
               </div>
               <h1 className="fac-page-title">All Faculties</h1>
               <p className="fac-page-sub">
                  Mint faculty accounts. Each gets an email with login credentials.
                  Coordinators can then be{" "}
                  <Link to="/clubs" className="fac-inline-link">
                     assigned clubs
                  </Link>{" "}
                  to administer.
               </p>
            </div>

            <div className="fac-stat-row">
               <StatCard tone="purple" label="Total faculty" value={stats?.total} loading={!stats}>
                  <Icon size={20} strokeWidth={2.2}>
                     <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                     <path d="M6 12v5c3 3 9 3 12 0v-5" />
                  </Icon>
               </StatCard>
               <StatCard tone="green" label="Active" value={stats?.active} loading={!stats}>
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
                  label="Coordinating clubs"
                  value={stats?.coordinatingClubs}
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
               <div className="fac-search">
                  <Icon size={15}>
                     <circle cx="11" cy="11" r="8" />
                     <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </Icon>
                  <input
                     placeholder="Search by name or email…"
                     value={search}
                     onChange={(e) => setSearch(e.target.value)}
                  />
               </div>
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
               <div className="ac-sort">
                  <Icon size={13} strokeWidth={2.2}>
                     <line x1="3" y1="6" x2="13" y2="6" />
                     <line x1="3" y1="12" x2="10" y2="12" />
                     <line x1="3" y1="18" x2="7" y2="18" />
                  </Icon>
                  <span>Sort</span>
                  <select
                     value={sort}
                     onChange={(e) => setSort(e.target.value)}
                     aria-label="Sort faculty"
                  >
                     {SORTS.map((s) => (
                        <option key={s.id} value={s.id}>
                           {s.label}
                        </option>
                     ))}
                  </select>
               </div>
            </div>

            <div className="fac-table-card">
               {loading && !data ? (
                  <LoadingBlock label="Loading faculty" size={24} />
               ) : showEmpty ? (
                  <div className="profile-empty">
                     No faculty match your search. Create one with “Create faculty”.
                  </div>
               ) : (
                  <>
                     <table className={`fac-dt${loading ? " is-refetching" : ""}`}>
                        <thead>
                           <tr>
                              <th>Faculty</th>
                              <th>Clubs</th>
                              <th>Created</th>
                              <th>Last active</th>
                              <th>Active</th>
                           </tr>
                        </thead>
                        <tbody>
                           {items.map((u) => (
                              <tr
                                 key={u.id}
                                 className={u.isActive ? "" : "inactive"}
                              >
                                    <td>
                                       <div className="fac-cell">
                                          <div
                                             className="fac-avatar"
                                             style={{ background: colorFor(u.name) }}
                                          >
                                             {initials(u.name)}
                                          </div>
                                          <div>
                                             <div className="fac-name">{u.name}</div>
                                             <div className="fac-email">{u.email}</div>
                                          </div>
                                       </div>
                                    </td>
                                    <td>
                                       <span className={`fac-clubs${u.clubCount === 0 ? " zero" : ""}`}>
                                          {u.clubCount} club{u.clubCount === 1 ? "" : "s"}
                                       </span>
                                    </td>
                                    <td>
                                       <span className="fac-date">{formatDate(u.createdAt)}</span>
                                    </td>
                                    <td>
                                       <span className="fac-date">{timeAgo(u.lastLoginAt)}</span>
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
                                                title={u.isActive ? "Deactivate" : "Reactivate"}
                                                aria-label={u.isActive ? "Deactivate" : "Reactivate"}
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
                           {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                              <button
                                 type="button"
                                 key={n}
                                 className={`fac-pg${n === page ? " active" : ""}`}
                                 onClick={() => setPage(n)}
                              >
                                 {n}
                              </button>
                           ))}
                           <button
                              type="button"
                              className="fac-pg"
                              disabled={!(pagination?.hasMore ?? page < totalPages)}
                              onClick={() => setPage((p) => p + 1)}
                           >
                              Next ›
                           </button>
                        </div>
                     </div>
                  </>
               )}
            </div>
         </div>

         {modalOpen && (
            <CreateFacultyModal
               onClose={() => setModalOpen(false)}
               onCreated={() => {
                  fetchFaculty();
                  fetchStats();
               }}
            />
         )}
      </AppShell>
   );
}
