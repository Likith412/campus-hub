import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { adminApi, clubsApi, ApiError } from "../services";
import AppShell from "../components/layout/AppShell";
import Icon from "../components/Icon";
import { LoadingBlock } from "../components/Spinner";
import { useToast } from "../contexts/ToastContext";
import { useConfirm } from "../contexts/ConfirmContext";
import { CATEGORY_LABEL } from "../utils/clubs";
import useDebounced from "../hooks/useDebounced";
import useLatestRequest from "../hooks/useLatestRequest";
import SearchField from "../components/SearchField";
import FilterSelect from "../components/FilterSelect";

const PAGE_SIZE = 10;
const FILTER_TABS = [
   { id: "all", label: "All" },
   { id: "active", label: "Active" },
   { id: "suspended", label: "Suspended" },
   { id: "archived", label: "Archived" },
];
const SORTS = [
   { id: "popular", label: "Most members" },
   { id: "new", label: "Newest" },
   { id: "name", label: "A → Z" },
];

function clubInitials(name = "") {
   const parts = name.trim().split(/\s+/);
   return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}
function logoGradient(c) {
   const from = c.coverFrom || "#6c63ff";
   const to = c.coverTo || "#34d399";
   return `linear-gradient(135deg, ${from}, ${to})`;
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

export default function AllClubs() {
   const toast = useToast();
   const confirm = useConfirm();
   const navigate = useNavigate();

   const [search, setSearch] = useState("");
   const debounced = useDebounced(search.trim());
   const [domain, setDomain] = useState("");
   const [sort, setSort] = useState("popular");
   const [filter, setFilter] = useState("all");
   const [page, setPage] = useState(1);
   const [data, setData] = useState(null);
   const [loadedKey, setLoadedKey] = useState(null);
   const [busyId, setBusyId] = useState(null);
   const startRequest = useLatestRequest();

   const currentKey = `${debounced}|${domain}|${sort}|${filter}|${page}`;
   const loading = loadedKey !== currentKey;


   // Reset to page 1 when filters change.
   const [prevFilters, setPrevFilters] = useState({
      debounced,
      domain,
      sort,
      filter,
   });
   if (
      prevFilters.debounced !== debounced ||
      prevFilters.domain !== domain ||
      prevFilters.sort !== sort ||
      prevFilters.filter !== filter
   ) {
      setPrevFilters({ debounced, domain, sort, filter });
      setPage(1);
   }

   const fetchClubs = useCallback(() => {
      const isCurrent = startRequest();
      const myKey = `${debounced}|${domain}|${sort}|${filter}|${page}`;
      adminApi
         .listClubs({
            q: debounced || undefined,
            category: domain || undefined,
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
               err instanceof ApiError ? err.message : "Couldn't load clubs",
            );
            setData({
               items: [],
               counts: { total: 0, active: 0, suspended: 0, archived: 0 },
               pagination: { page, limit: PAGE_SIZE, total: 0, hasMore: false },
            });
         })
         .finally(() => {
            if (isCurrent()) setLoadedKey(myKey);
         });
   }, [debounced, domain, sort, filter, page, toast, startRequest]);

   useEffect(() => {
      fetchClubs();
   }, [fetchClubs]);

   const items = data?.items || [];
   const counts = data?.counts;
   const pagination = data?.pagination;
   const totalPages = useMemo(() => {
      if (!pagination) return 1;
      return Math.max(1, Math.ceil(pagination.total / pagination.limit));
   }, [pagination]);
   const showEmpty = !loading && items.length === 0;
   const rangeStart = pagination ? (pagination.page - 1) * pagination.limit + 1 : 0;
   const rangeEnd = pagination ? rangeStart + items.length - 1 : 0;

   // Suspend / archive / reactivate a club inline. Refetch so the cards + filtered list stay correct.
   async function handleSetStatus(club, next) {
      if (next === club.status) return;
      const verb = {
         active: "Reactivate",
         suspended: "Suspend",
         archived: "Archive",
      };
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
      setBusyId(club.id);
      try {
         await clubsApi.setStatus(club.slug, next);
         toast.success(next === "active" ? "Club reactivated" : `Club ${next}`);
         fetchClubs();
      } catch (err) {
         toast.error(
            err instanceof ApiError ? err.message : "Couldn't update status",
         );
      } finally {
         setBusyId(null);
      }
   }

   // Flip the verified ✓ badge inline, with a confirm.
   async function handleToggleVerify(club) {
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
      setBusyId(club.id);
      try {
         await clubsApi.setVerification(club.slug, next);
         setData((d) =>
            d
               ? {
                    ...d,
                    items: d.items.map((c) =>
                       c.id === club.id ? { ...c, verified: next } : c,
                    ),
                 }
               : d,
         );
         toast.success(next ? "Club verified" : "Verification removed");
      } catch (err) {
         toast.error(
            err instanceof ApiError ? err.message : "Couldn't update verification",
         );
      } finally {
         setBusyId(null);
      }
   }

   return (
      <AppShell
         title="All Clubs"
         topbarRight={
            <button
               type="button"
               className="btn btn-primary"
               onClick={() => navigate("/clubs/new")}
            >
               <Icon size={13} strokeWidth={2.5}>
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
               </Icon>
               New club
            </button>
         }
      >
         <div className="main faculty-page">
            <div className="fac-pagehead">
               <h1 className="fac-page-title">All clubs</h1>
               <p className="fac-page-sub">
                  Every club across the campus — its coordinators, membership and
                  status. Open a club to verify, suspend or reassign faculty.
               </p>
            </div>

            <div className="fac-stat-row">
               <StatCard tone="purple" label="Total clubs" value={counts?.total} loading={!counts}>
                  <Icon size={20} strokeWidth={2.2}>
                     <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                     <circle cx="9" cy="7" r="4" />
                     <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  </Icon>
               </StatCard>
               <StatCard tone="green" label="Active" value={counts?.active} loading={!counts}>
                  <Icon size={20} strokeWidth={2.2}>
                     <path d="M9 12l2 2 4-4" />
                     <circle cx="12" cy="12" r="10" />
                  </Icon>
               </StatCard>
               <StatCard tone="orange" label="Suspended" value={counts?.suspended} loading={!counts}>
                  <Icon size={20} strokeWidth={2.2}>
                     <circle cx="12" cy="12" r="10" />
                     <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                  </Icon>
               </StatCard>
               <StatCard tone="blue" label="Archived" value={counts?.archived} loading={!counts}>
                  <Icon size={20} strokeWidth={2.2}>
                     <polyline points="21 8 21 21 3 21 3 8" />
                     <rect x="1" y="3" width="22" height="5" />
                     <line x1="10" y1="12" x2="14" y2="12" />
                  </Icon>
               </StatCard>
            </div>

            <div className="fac-toolbar">
               <SearchField
                  placeholder="Search clubs…"
                  value={search}
                  onChange={setSearch}
               />
               <select
                  className="ac-select"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
               >
                  <option value="">All domains</option>
                  {Object.entries(CATEGORY_LABEL).map(([id, label]) => (
                     <option key={id} value={id}>
                        {label}
                     </option>
                  ))}
               </select>
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
                  ariaLabel="Sort clubs"
                  withIcon
               />
            </div>

            <div className="fac-table-card">
               {loading && !data ? (
                  <LoadingBlock label="Loading clubs" size={24} />
               ) : showEmpty ? (
                  <div className="profile-empty">No clubs match these filters.</div>
               ) : (
                  <>
                     <table className={`fac-dt${loading ? " is-refetching" : ""}`}>
                        <thead>
                           <tr>
                              <th>Club</th>
                              <th>Domain</th>
                              <th>Coordinator</th>
                              <th>Members</th>
                              <th>Status</th>
                              <th>Verified</th>
                           </tr>
                        </thead>
                        <tbody>
                           {items.map((c) => (
                              <tr
                                 key={c.id}
                                 className={`ac-row${c.status !== "active" ? " dim" : ""}`}
                                 onClick={() => navigate(`/admin/clubs/${c.slug}`)}
                              >
                                 <td>
                                    <div className="fac-cell">
                                       <div
                                          className="ac-logo"
                                          style={{ background: logoGradient(c) }}
                                       >
                                          {c.logoUrl ? (
                                             <img src={c.logoUrl} alt="" />
                                          ) : (
                                             clubInitials(c.name)
                                          )}
                                       </div>
                                       <div>
                                          <div className="ac-name">
                                             {c.name}
                                             {c.verified && (
                                                <span
                                                   className="verified-tick"
                                                   title="Verified"
                                                >
                                                   <Icon size={9} strokeWidth={4}>
                                                      <polyline points="20 6 9 17 4 12" />
                                                   </Icon>
                                                </span>
                                             )}
                                          </div>
                                          {c.tagline && (
                                             <div className="ac-tagline">
                                                {c.tagline}
                                             </div>
                                          )}
                                       </div>
                                    </div>
                                 </td>
                                 <td>
                                    <span className="ac-domain">
                                       {CATEGORY_LABEL[c.category] || c.category}
                                    </span>
                                 </td>
                                 <td>
                                    {c.coordinators.length ? (
                                       <span
                                          className="ac-coord"
                                          title={c.coordinators.join(", ")}
                                       >
                                          {c.coordinators.slice(0, 2).join(", ")}
                                          {c.coordinators.length > 2 && (
                                             <span className="ac-coord-more">
                                                +{c.coordinators.length - 2}
                                             </span>
                                          )}
                                       </span>
                                    ) : (
                                       <span className="ac-coord unassigned">
                                          Unassigned
                                       </span>
                                    )}
                                 </td>
                                 <td>
                                    <span className="ac-num">
                                       <b>{c.memberCount}</b>
                                    </span>
                                 </td>
                                 <td onClick={(e) => e.stopPropagation()}>
                                    <select
                                       className={`ac-status-select ${c.status}`}
                                       value={c.status}
                                       disabled={busyId === c.id}
                                       onChange={(e) =>
                                          handleSetStatus(c, e.target.value)
                                       }
                                       aria-label={`Status for ${c.name}`}
                                    >
                                       <option value="active">Active</option>
                                       <option value="suspended">Suspended</option>
                                       <option value="archived">Archived</option>
                                    </select>
                                 </td>
                                 <td onClick={(e) => e.stopPropagation()}>
                                    <button
                                       type="button"
                                       className={`fac-toggle${c.verified ? "" : " off"}`}
                                       disabled={busyId === c.id}
                                       onClick={() => handleToggleVerify(c)}
                                       title={c.verified ? "Unverify" : "Verify"}
                                       aria-label={c.verified ? "Unverify" : "Verify"}
                                    />
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
      </AppShell>
   );
}
