import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { clubsApi, ApiError } from "../services";
import { useAuth } from "../contexts/AuthContext";
import AppShell from "../components/layout/AppShell";
import Icon from "../components/Icon";
import { LoadingBlock } from "../components/Spinner";
import Pagination from "../components/Pagination";
import EditClubModal from "../components/EditClubModal";
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

// Colour-coded role badge from the per-club ClubRole (name + colour). Falls back to
// the raw slug for any membership whose role row hasn't loaded yet.
function RoleBadge({ slug, roleBySlug }) {
   const role = roleBySlug[slug];
   const name = role?.name || ROLE_LABEL[slug] || slug;
   const color = role?.color || "#94a3b8";
   return (
      <span
         className="ml-role"
         style={{ color, background: `${color}1f` }}
      >
         {name}
      </span>
   );
}

// Read-only member row — the members directory is identical for every viewer.
function MemberRow({ row, roleBySlug }) {
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
         <RoleBadge slug={row.role} roleBySlug={roleBySlug} />
         <span className="ml-engage">{row.engagementScore}</span>
         <span />
      </div>
   );
}

export default function ClubDetail() {
   const { slug } = useParams();
   const toast = useToast();
   const confirm = useConfirm();
   const { user } = useAuth();
   const isStudent = user?.role === "student";
   const [club, setClub] = useState(null);
   const [clubLoadedSlug, setClubLoadedSlug] = useState(null);
   const [joinBusy, setJoinBusy] = useState(false);
   const [editing, setEditing] = useState(false);
   const [tab, setTab] = useState("members");

   // Members tab state
   const [search, setSearch] = useState("");
   const [debounced, setDebounced] = useState("");
   const [roleFilter, setRoleFilter] = useState("");
   const [sort, setSort] = useState("role");
   const [page, setPage] = useState(1);
   const [members, setMembers] = useState(null);
   const [membersLoadedKey, setMembersLoadedKey] = useState(null);
   const reqIdRef = useRef(0);

   // Roles (Phase 6) — drives the badges, the role filter, and the Roles tab.
   const [roles, setRoles] = useState([]);
   const [rolesViewer, setRolesViewer] = useState(null);
   const roleBySlug = useMemo(
      () => Object.fromEntries(roles.map((r) => [r.slug, r])),
      [roles],
   );

   // Loading derived from key mismatch — avoids setState-in-effect.
   const clubLoading = clubLoadedSlug !== slug;
   const membersKey = `${slug}|${debounced}|${roleFilter}|${sort}|${page}`;
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

   const refetchRoles = useCallback(() => {
      clubsApi
         .listRoles(slug)
         .then((d) => {
            setRoles(d.items || []);
            setRolesViewer(d.viewer || null);
         })
         .catch(() => {
            setRoles([]);
            setRolesViewer(null);
         });
   }, [slug]);

   useEffect(() => {
      refetchRoles();
   }, [refetchRoles]);

   const fetchMembers = useCallback(() => {
      const myId = ++reqIdRef.current;
      const myKey = `${slug}|${debounced}|${roleFilter}|${sort}|${page}`;
      clubsApi
         .listMembers(slug, {
            q: debounced || undefined,
            role: roleFilter || undefined,
            sort,
            status: "approved",
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
               pagination: { page, limit: PAGE_SIZE, total: 0, hasMore: false },
            });
         })
         .finally(() => {
            if (myId === reqIdRef.current) setMembersLoadedKey(myKey);
         });
   }, [slug, debounced, roleFilter, sort, page, toast]);

   useEffect(() => {
      fetchMembers();
   }, [fetchMembers]);

   // Reset to page 1 when filters change
   const [prev, setPrev] = useState({ debounced, roleFilter, sort });
   if (
      prev.debounced !== debounced ||
      prev.roleFilter !== roleFilter ||
      prev.sort !== sort
   ) {
      setPrev({ debounced, roleFilter, sort });
      setPage(1);
   }

   const pagination = members?.pagination;
   const totalPages = useMemo(() => {
      if (!pagination) return 1;
      return Math.max(1, Math.ceil(pagination.total / pagination.limit));
   }, [pagination]);

   async function handleJoin() {
      if (!club) return;
      const isRequest = club.joinPolicy === "request";
      const ok = await confirm({
         title: isRequest
            ? `Request to join ${club.name}?`
            : `Join ${club.name}?`,
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
                    membership: {
                       ...(c.membership || {}),
                       status: res.status,
                       role: "member",
                    },
                    memberCount:
                       res.status === "approved"
                          ? c.memberCount + 1
                          : c.memberCount,
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

   // Faculty may only open the detail page for a club they actually coordinate.
   const isFaculty = user?.role === "faculty";
   const isClubCoordinator =
      club.membership?.role === "coordinator" &&
      club.membership?.status === "approved";
   if (isFaculty && !isClubCoordinator) {
      return (
         <AppShell title="Club">
            <div className="main">
               <div className="profile-empty">
                  You can only view clubs you coordinate.
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
   // A coordinator of this club can't leave it (only a superAdmin can step them down).
   // Only students can join/leave, so the CTA is shown to students only. The label and
   // behaviour (Join / Request to join / Pending / Leave / Invite-only) come from the
   // club's join policy + this student's membership status (see joinKind/joinLabel above).
   const showJoinButton = isStudent;

   const items = members?.items || [];

   return (
      <AppShell title={`Club · ${club.name}`}>
         <div className="main">
            <div className="breadcrumb">
               {isStudent ? <Link to="/clubs">Clubs</Link> : <span>Clubs</span>}
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
               <div
                  className="club-id-logo"
                  style={{ background: gradient(club) }}
               >
                  {club.logoUrl ? (
                     <img src={club.logoUrl} alt="" />
                  ) : (
                     initials(club.name)
                  )}
               </div>
               <div className="club-id-text">
                  <div className="club-name">
                     {club.name}
                     {club.verified && (
                        <span
                           className="verified-tick"
                           title="Verified by institute"
                        >
                           <Icon size={9} strokeWidth={4}>
                              <polyline points="20 6 9 17 4 12" />
                           </Icon>
                        </span>
                     )}
                     {club.status && club.status !== "active" && (
                        <span className={`club-status-pill ${club.status}`}>
                           {club.status}
                        </span>
                     )}
                  </div>
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
                  {club.tagline && (
                     <div className="club-tagline">{club.tagline}</div>
                  )}
                  {club.description && (
                     <div className="club-about">{club.description}</div>
                  )}
               </div>
               <div className="club-actions">
                  {(user?.role === "superAdmin" || rolesViewer?.canEditClub) && (
                     <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setEditing(true)}
                     >
                        <Icon size={14} strokeWidth={2.2}>
                           <path d="M12 20h9" />
                           <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </Icon>
                        Edit club
                     </button>
                  )}
                  {(user?.role === "superAdmin" ||
                     rolesViewer?.canModerate ||
                     rolesViewer?.canAssignRole) && (
                     <Link
                        className="btn btn-secondary"
                        to={`/clubs/${slug}/members`}
                     >
                        <Icon size={14} strokeWidth={2.2}>
                           <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                           <circle cx="9" cy="7" r="4" />
                           <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                        </Icon>
                        Manage members
                     </Link>
                  )}
                  {rolesViewer?.canManageRoles && (
                     <Link
                        className="btn btn-secondary"
                        to={`/clubs/${slug}/roles`}
                     >
                        <Icon size={14} strokeWidth={2.2}>
                           <path d="M12 2 2 7l10 5 10-5-10-5Z" />
                           <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
                        </Icon>
                        Roles
                     </Link>
                  )}
                  {showJoinButton && (
                     <button
                        type="button"
                        className={`join-btn ${joinCls}`}
                        disabled={joinDisabled}
                        onClick={onJoinClick}
                     >
                        {joinBusy ? "…" : joinLabel}
                     </button>
                  )}
               </div>
            </div>

            {/* TABS */}
            <div className="club-tabs">
               <div
                  className={`ct-tab${tab === "members" ? " active" : ""}`}
                  onClick={() => setTab("members")}
               >
                  <Icon size={13} strokeWidth={2.2}>
                     <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                     <circle cx="9" cy="7" r="4" />
                  </Icon>
                  Members
                  <span className="count">{club.memberCount}</span>
               </div>
            </div>

            {/* MEMBERS TAB */}
            {tab === "members" && (
               <div className="tab-pane active">
                  <div className="member-list">
                     <div className="ml-head">
                        <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                           {pagination?.total ?? 0}{" "}
                           {status === "pending"
                              ? "pending requests"
                              : "members"}
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
                           <select
                              value={roleFilter}
                              onChange={(e) => setRoleFilter(e.target.value)}
                           >
                              <option value="">All roles</option>
                              {roles.map((r) => (
                                 <option key={r.slug} value={r.slug}>
                                    {r.name}
                                 </option>
                              ))}
                           </select>
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
                                 aria-label="Sort members"
                              >
                                 <option value="role">Role</option>
                                 <option value="new">Recently joined</option>
                                 <option value="active">Most active</option>
                              </select>
                           </div>
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
                           No members match your search.
                        </div>
                     ) : (
                        items.map((row) => (
                           <MemberRow
                              key={row.userId}
                              row={row}
                              roleBySlug={roleBySlug}
                           />
                        ))
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

         {editing && (
            <EditClubModal
               club={club}
               slug={slug}
               onClose={() => setEditing(false)}
               onChanged={() => {
                  setEditing(false);
                  refetchClub();
               }}
            />
         )}
      </AppShell>
   );
}
