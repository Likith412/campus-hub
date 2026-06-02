import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { clubsApi, ApiError } from "../services";
import AppShell from "../components/layout/AppShell";
import Icon from "../components/Icon";
import { LoadingBlock } from "../components/Spinner";
import Pagination from "../components/Pagination";
import { useToast } from "../contexts/ToastContext";
import { useConfirm } from "../contexts/ConfirmContext";

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

const CATEGORY_GRADIENT = {
   tech: ["#4c1d95", "#6c63ff"],
   design: ["#f59e0b", "#fcd34d"],
   culture: ["#991b1b", "#ef4444"],
   sports: ["#064e3b", "#34d399"],
   business: ["#4338ca", "#818cf8"],
   media: ["#831843", "#ec4899"],
   social: ["#0f766e", "#2dd4bf"],
   other: ["#4338ca", "#818cf8"],
};

const ROLE_LABEL = { coordinator: "Coordinator", member: "Member" };
const YEAR_LABEL = {
   1: "1st yr",
   2: "2nd yr",
   3: "3rd yr",
   4: "4th yr",
   postgrad: "PG",
};
const PAGE_SIZE = 20;

function initials(name = "") {
   const parts = name.trim().split(/\s+/);
   return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

function gradient(club) {
   const [a, b] = CATEGORY_GRADIENT[club?.category] || CATEGORY_GRADIENT.other;
   return `linear-gradient(135deg, ${club?.coverFrom || a}, ${club?.coverTo || b})`;
}

function formatJoined(d) {
   if (!d) return "—";
   const date = new Date(d);
   return date.toLocaleDateString("en-IN", {
      month: "short",
      year: "numeric",
   });
}

function HeaderSkeleton() {
   return <LoadingBlock label="Loading club" size={26} />;
}

function MemberRow({ row, canManage, busy, onChangeRole, onRemove }) {
   const [menuOpen, setMenuOpen] = useState(false);
   const ref = useRef(null);

   useEffect(() => {
      if (!menuOpen) return;
      const onDoc = (e) => {
         if (!ref.current?.contains(e.target)) setMenuOpen(false);
      };
      document.addEventListener("mousedown", onDoc);
      return () => document.removeEventListener("mousedown", onDoc);
   }, [menuOpen]);

   const meta = [
      row.department,
      row.year && YEAR_LABEL[row.year],
      `Joined ${formatJoined(row.joinedAt || row.createdAt)}`,
   ]
      .filter(Boolean)
      .join(" · ");

   return (
      <div className="ml-row">
         <div className="avatar sm">
            {row.avatarUrl ? (
               <img src={row.avatarUrl} alt="" />
            ) : (
               initials(row.name)
            )}
         </div>
         <div>
            <div className="ml-name">{row.name}</div>
            <div className="ml-meta">{meta}</div>
         </div>
         <span className={`ml-role ${row.role}`}>{ROLE_LABEL[row.role]}</span>
         <span className="ml-engage">{row.engagementScore}</span>
         {canManage ? (
            <div className="ml-menu-wrap" ref={ref}>
               <button
                  type="button"
                  className="ml-action"
                  disabled={busy}
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-label="Manage member"
               >
                  <Icon size={14} strokeWidth={2.2}>
                     <circle cx="12" cy="12" r="1" />
                     <circle cx="19" cy="12" r="1" />
                     <circle cx="5" cy="12" r="1" />
                  </Icon>
               </button>
               {menuOpen && (
                  <div className="ml-menu" role="menu">
                     {/* coordinator can only be assigned by superAdmin (1c); offered only as a demote → member here. */}
                     {row.role !== "member" && (
                        <button
                           type="button"
                           onClick={() => {
                              setMenuOpen(false);
                              onChangeRole(row, "member");
                           }}
                        >
                           Make member
                        </button>
                     )}
                     <button
                        type="button"
                        className="danger"
                        onClick={() => {
                           setMenuOpen(false);
                           onRemove(row);
                        }}
                     >
                        Remove from club
                     </button>
                  </div>
               )}
            </div>
         ) : (
            <span />
         )}
      </div>
   );
}

function PendingRow({ row, busy, onApprove, onReject }) {
   const meta = [
      row.department,
      row.year && YEAR_LABEL[row.year],
      `Requested ${formatJoined(row.createdAt)}`,
   ]
      .filter(Boolean)
      .join(" · ");
   return (
      <div className="ml-row pending">
         <div className="avatar sm">
            {row.avatarUrl ? (
               <img src={row.avatarUrl} alt="" />
            ) : (
               initials(row.name)
            )}
         </div>
         <div>
            <div className="ml-name">{row.name}</div>
            <div className="ml-meta">{meta}</div>
         </div>
         <span className="ml-role">Pending</span>
         <div className="ml-pending-actions">
            <button
               type="button"
               className="btn btn-secondary btn-sm"
               disabled={busy}
               onClick={() => onReject(row)}
            >
               Reject
            </button>
            <button
               type="button"
               className="btn btn-primary btn-sm"
               disabled={busy}
               onClick={() => onApprove(row)}
            >
               Approve
            </button>
         </div>
      </div>
   );
}

export default function ClubDetail() {
   const { slug } = useParams();
   const toast = useToast();
   const confirm = useConfirm();
   const [club, setClub] = useState(null);
   const [clubLoadedSlug, setClubLoadedSlug] = useState(null);
   const [joinBusy, setJoinBusy] = useState(false);
   const [tab, setTab] = useState("members");

   // Members tab state
   const [search, setSearch] = useState("");
   const [debounced, setDebounced] = useState("");
   const [roleFilter, setRoleFilter] = useState("");
   const [status, setStatus] = useState("approved");
   const [page, setPage] = useState(1);
   const [members, setMembers] = useState(null);
   const [membersLoadedKey, setMembersLoadedKey] = useState(null);
   const [busyUserId, setBusyUserId] = useState(null);
   const reqIdRef = useRef(0);

   // Loading derived from key mismatch — avoids setState-in-effect.
   const clubLoading = clubLoadedSlug !== slug;
   const membersKey = `${slug}|${debounced}|${roleFilter}|${status}|${page}`;
   const membersLoading = membersLoadedKey !== membersKey;

   useEffect(() => {
      const id = setTimeout(() => setDebounced(search.trim()), 300);
      return () => clearTimeout(id);
   }, [search]);

   const refetchClub = useCallback(() => {
      clubsApi
         .getClub(slug)
         .then((d) => setClub(d))
         .catch((err) => {
            toast.error(
               err instanceof ApiError ? err.message : "Couldn't load club",
            );
            setClub(null);
         })
         .finally(() => setClubLoadedSlug(slug));
   }, [slug, toast]);

   useEffect(() => {
      refetchClub();
   }, [refetchClub]);

   const fetchMembers = useCallback(() => {
      const myId = ++reqIdRef.current;
      const myKey = `${slug}|${debounced}|${roleFilter}|${status}|${page}`;
      clubsApi
         .listMembers(slug, {
            q: debounced || undefined,
            role: roleFilter || undefined,
            status,
            page,
            limit: PAGE_SIZE,
         })
         .then((d) => {
            if (myId !== reqIdRef.current) return;
            setMembers(d);
         })
         .catch((err) => {
            if (myId !== reqIdRef.current) return;
            toast.error(
               err instanceof ApiError ? err.message : "Couldn't load members",
            );
            setMembers({
               items: [],
               viewerIsCoordinator: false,
               pagination: { page, limit: PAGE_SIZE, total: 0, hasMore: false },
            });
         })
         .finally(() => {
            if (myId === reqIdRef.current) setMembersLoadedKey(myKey);
         });
   }, [slug, debounced, roleFilter, status, page, toast]);

   useEffect(() => {
      fetchMembers();
   }, [fetchMembers]);

   // Reset to page 1 when filters change
   const [prev, setPrev] = useState({ debounced, roleFilter, status });
   if (
      prev.debounced !== debounced ||
      prev.roleFilter !== roleFilter ||
      prev.status !== status
   ) {
      setPrev({ debounced, roleFilter, status });
      setPage(1);
   }

   const viewerIsCoordinator = !!members?.viewerIsCoordinator;
   const pagination = members?.pagination;
   const totalPages = useMemo(() => {
      if (!pagination) return 1;
      return Math.max(1, Math.ceil(pagination.total / pagination.limit));
   }, [pagination]);

   async function handleJoin() {
      if (!club) return;
      const isRequest = club.joinPolicy === "request";
      const ok = await confirm({
         title: isRequest ? `Request to join ${club.name}?` : `Join ${club.name}?`,
         message: isRequest
            ? "A club coordinator will review your request before you're added."
            : "You'll be added to the club immediately.",
         confirmLabel: isRequest ? "Send request" : "Join club",
      });
      if (!ok) return;
      setJoinBusy(true);
      try {
         const res = await clubsApi.joinClub(slug);
         setClub((c) =>
            c
               ? {
                    ...c,
                    membership: { ...(c.membership || {}), status: res.status, role: "member" },
                    memberCount: res.status === "approved" ? c.memberCount + 1 : c.memberCount,
                 }
               : c,
         );
         toast.success(
            res.status === "approved" ? `Joined ${club.name}` : "Request sent",
         );
         if (res.status === "approved") fetchMembers();
      } catch (err) {
         toast.error(err instanceof ApiError ? err.message : "Couldn't join");
      } finally {
         setJoinBusy(false);
      }
   }

   async function handleLeave() {
      if (!club) return;
      const ok = await confirm({
         title: `Leave ${club.name}?`,
         message: "You'll lose access to members-only posts and events.",
         confirmLabel: "Leave club",
         danger: true,
      });
      if (!ok) return;
      setJoinBusy(true);
      try {
         await clubsApi.leaveClub(slug);
         setClub((c) =>
            c
               ? {
                    ...c,
                    membership: null,
                    memberCount: Math.max(0, c.memberCount - 1),
                 }
               : c,
         );
         toast.success(`You left ${club.name}`);
         fetchMembers();
      } catch (err) {
         toast.error(err instanceof ApiError ? err.message : "Couldn't leave");
      } finally {
         setJoinBusy(false);
      }
   }

   async function handleChangeRole(row, role) {
      const ok = await confirm({
         title: `Change role to ${ROLE_LABEL[role].toLowerCase()}?`,
         message: `${row.name} will become ${ROLE_LABEL[role].toLowerCase()} of this club.`,
         confirmLabel: "Change role",
      });
      if (!ok) return;
      setBusyUserId(row.userId);
      try {
         await clubsApi.updateMember(slug, row.userId, { role });
         toast.success("Role updated");
         fetchMembers();
      } catch (err) {
         toast.error(
            err instanceof ApiError ? err.message : "Couldn't update role",
         );
      } finally {
         setBusyUserId(null);
      }
   }

   async function handleRemove(row) {
      const ok = await confirm({
         title: `Remove ${row.name}?`,
         message: "They will lose access to club content. They can rejoin later.",
         confirmLabel: "Remove",
         danger: true,
      });
      if (!ok) return;
      setBusyUserId(row.userId);
      try {
         await clubsApi.removeMember(slug, row.userId);
         toast.success("Member removed");
         setClub((c) =>
            c ? { ...c, memberCount: Math.max(0, c.memberCount - 1) } : c,
         );
         fetchMembers();
      } catch (err) {
         toast.error(
            err instanceof ApiError ? err.message : "Couldn't remove member",
         );
      } finally {
         setBusyUserId(null);
      }
   }

   async function handleApprove(row) {
      setBusyUserId(row.userId);
      try {
         await clubsApi.updateMember(slug, row.userId, { status: "approved" });
         toast.success(`${row.name} approved`);
         setClub((c) => (c ? { ...c, memberCount: c.memberCount + 1 } : c));
         fetchMembers();
      } catch (err) {
         toast.error(err instanceof ApiError ? err.message : "Couldn't approve");
      } finally {
         setBusyUserId(null);
      }
   }

   async function handleReject(row) {
      const ok = await confirm({
         title: `Reject ${row.name}'s request?`,
         confirmLabel: "Reject",
         danger: true,
      });
      if (!ok) return;
      setBusyUserId(row.userId);
      try {
         await clubsApi.updateMember(slug, row.userId, { status: "rejected" });
         toast.success("Request rejected");
         fetchMembers();
      } catch (err) {
         toast.error(err instanceof ApiError ? err.message : "Couldn't reject");
      } finally {
         setBusyUserId(null);
      }
   }

   if (clubLoading && !club) {
      return (
         <AppShell title="Club">
            <div className="main">
               <HeaderSkeleton />
            </div>
         </AppShell>
      );
   }

   if (!club) {
      return (
         <AppShell title="Club">
            <div className="main">
               <div className="profile-empty">
                  Club not found.{" "}
                  <Link to="/clubs" style={{ color: "var(--accent-purple)" }}>
                     Back to clubs
                  </Link>
               </div>
            </div>
         </AppShell>
      );
   }

   const memberStatus = club.membership?.status;
   let joinLabel = "Join";
   let joinCls = "";
   let joinKind = "join"; // "join" | "leave" | "noop"
   if (memberStatus === "approved") {
      joinLabel = "Leave";
      joinCls = "member";
      joinKind = "leave";
   } else if (memberStatus === "pending") {
      joinLabel = "Pending";
      joinCls = "pending";
      joinKind = "noop";
   } else if (club.joinPolicy === "invite-only") {
      joinLabel = "Invite-only";
      joinCls = "disabled";
      joinKind = "noop";
   } else if (club.joinPolicy === "request") {
      joinLabel = "Request to join";
   }
   const joinDisabled = joinBusy || joinKind === "noop";
   function onJoinClick() {
      if (joinKind === "leave") handleLeave();
      else if (joinKind === "join") handleJoin();
   }

   const items = members?.items || [];

   return (
      <AppShell title={`Club · ${club.name}`}>
         <div className="main">
            <div className="breadcrumb">
               <Link to="/clubs">Clubs</Link>
               <span className="sep">›</span>
               <span className="now">{club.name}</span>
            </div>

            {/* BANNER */}
            <div
               className="club-banner"
               style={
                  club.bannerUrl
                     ? { background: `url(${club.bannerUrl}) center/cover` }
                     : undefined
               }
            />

            {/* IDENTITY */}
            <div className="club-id">
               <div className="club-id-logo" style={{ background: gradient(club) }}>
                  {club.logoUrl ? (
                     <img src={club.logoUrl} alt="" />
                  ) : (
                     initials(club.name)
                  )}
               </div>
               <div className="club-id-text">
                  <div className="club-name">{club.name}</div>
                  <div className="club-meta">
                     <span className="badge purple" style={{ fontSize: 10 }}>
                        {CATEGORY_LABEL[club.category] || club.category}
                     </span>
                     <span className="dot" />
                     <span>{club.memberCount} members</span>
                     {club.foundedYear && (
                        <>
                           <span className="dot" />
                           <span>Founded {club.foundedYear}</span>
                        </>
                     )}
                  </div>
                  {club.description && (
                     <div className="club-tagline">{club.description}</div>
                  )}
               </div>
               <div className="club-actions">
                  <button
                     type="button"
                     className={`join-btn ${joinCls}`}
                     disabled={joinDisabled}
                     onClick={onJoinClick}
                  >
                     {joinBusy ? "…" : joinLabel}
                  </button>
               </div>
            </div>

            {/* TABS */}
            <div className="club-tabs">
               {[
                  { id: "members", label: "Members", count: club.memberCount },
               ].map((t) => (
                  <div
                     key={t.id}
                     className={`ct-tab${tab === t.id ? " active" : ""}`}
                     onClick={() => setTab(t.id)}
                  >
                     <Icon size={13} strokeWidth={2.2}>
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                     </Icon>
                     {t.label}
                     {typeof t.count === "number" && (
                        <span className="count">{t.count}</span>
                     )}
                  </div>
               ))}
            </div>

            {/* MEMBERS TAB */}
            {tab === "members" && (
               <div className="tab-pane active">
                  <div className="member-list">
                     <div className="ml-head">
                        <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                           {pagination?.total ?? 0}{" "}
                           {status === "pending" ? "pending requests" : "members"}
                        </div>
                        <div className="ml-search">
                           <Icon size={13} strokeWidth={2.2}>
                              <circle cx="11" cy="11" r="8" />
                              <line x1="21" y1="21" x2="16.65" y2="16.65" />
                           </Icon>
                           <input
                              placeholder="Search members…"
                              value={search}
                              onChange={(e) => setSearch(e.target.value)}
                           />
                        </div>
                        <div className="ml-filters">
                           {status === "approved" && (
                              <select
                                 value={roleFilter}
                                 onChange={(e) => setRoleFilter(e.target.value)}
                              >
                                 <option value="">All roles</option>
                                 <option value="coordinator">Coordinators</option>
                                 <option value="member">Members</option>
                              </select>
                           )}
                           {viewerIsCoordinator && (
                              <select
                                 value={status}
                                 onChange={(e) => setStatus(e.target.value)}
                              >
                                 <option value="approved">Approved</option>
                                 <option value="pending">Pending</option>
                              </select>
                           )}
                        </div>
                     </div>

                     {membersLoading && !members ? (
                        <LoadingBlock label="Loading members" size={22} />
                     ) : items.length === 0 ? (
                        <div
                           style={{
                              padding: 28,
                              textAlign: "center",
                              color: "var(--text-tertiary)",
                              fontSize: 13,
                           }}
                        >
                           {status === "pending"
                              ? "No pending requests."
                              : "No members match your search."}
                        </div>
                     ) : (
                        items.map((row) =>
                           status === "pending" ? (
                              <PendingRow
                                 key={row.userId}
                                 row={row}
                                 busy={busyUserId === row.userId}
                                 onApprove={handleApprove}
                                 onReject={handleReject}
                              />
                           ) : (
                              <MemberRow
                                 key={row.userId}
                                 row={row}
                                 canManage={viewerIsCoordinator}
                                 busy={busyUserId === row.userId}
                                 onChangeRole={handleChangeRole}
                                 onRemove={handleRemove}
                              />
                           ),
                        )
                     )}
                  </div>

                  {items.length > 0 && totalPages > 1 && (
                     <Pagination
                        page={page}
                        totalPages={totalPages}
                        perPage={PAGE_SIZE}
                        hasMore={pagination?.hasMore}
                        onChange={setPage}
                     />
                  )}
               </div>
            )}
         </div>
      </AppShell>
   );
}
