import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { clubsApi, eventsApi, announcementsApi, ApiError } from "../services";
import { clubsListHref } from "../utils/nav";
import PersonLink from "../components/PersonLink";
import EventCard from "../components/EventCard";
import { useAuth } from "../contexts/AuthContext";
import AppShell from "../components/layout/AppShell";
import Icon from "../components/Icon";
import { LoadingBlock } from "../components/Spinner";
import Pagination from "../components/Pagination";
import EditClubModal from "../components/EditClubModal";
import { useToast } from "../contexts/ToastContext";
import { useConfirm } from "../contexts/ConfirmContext";
import { initials } from "../utils/text";
import { CATEGORY_LABEL } from "../utils/clubs";
import useDebounced from "../hooks/useDebounced";
import useLatestRequest from "../hooks/useLatestRequest";
import FilterSelect from "../components/FilterSelect";

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
const EVENT_SORTS = [
   { id: "soonest", label: "Date · soonest" },
   { id: "latest", label: "Date · latest" },
   { id: "popular", label: "Most registered" },
   { id: "new", label: "Recently created" },
];

const PAGE_SIZE = 20;
const MEMBER_SORTS = [
   { id: "role", label: "Role" },
   { id: "new", label: "Recently joined" },
];

const NOTICES_PAGE = 8;

function gradient(club) {
   const [a, b] = CATEGORY_GRADIENT[club?.category] || CATEGORY_GRADIENT.other;
   return `linear-gradient(135deg, ${club?.coverFrom || a}, ${club?.coverTo || b})`;
}

// Announcement timestamps want more precision than a join month — same relative
// format the board page uses.
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
      <span className="ml-role" style={{ color, background: `${color}1f` }}>
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
            {initials(row.name)}
         </div>
         <div>
            <PersonLink user={row} className="ml-name" />
            <div className="ml-meta">{meta}</div>
         </div>
         <RoleBadge slug={row.role} roleBySlug={roleBySlug} />
         <span />
      </div>
   );
}

export default function ClubDetail() {
   const { slug } = useParams();
   const navigate = useNavigate();
   const toast = useToast();
   const confirm = useConfirm();
   const { user } = useAuth();
   const isStudent = user?.role === "student";
   // Where the parent crumb points, and what it's called, depend on the viewer.
   const [club, setClub] = useState(null);
   const [clubLoadedSlug, setClubLoadedSlug] = useState(null);
   const [joinBusy, setJoinBusy] = useState(false);
   const [followBusy, setFollowBusy] = useState(false);
   const [editing, setEditing] = useState(false);
   // ?tab= is the source of truth, not just a starting value — switching tabs
   // writes it back, so the URL stays shareable and the back button works.
   const [searchParams, setSearchParams] = useSearchParams();
   const urlTab = searchParams.get("tab");
   const tab =
      urlTab === "events" || urlTab === "announcements" ? urlTab : "members";
   const setTab = (id) =>
      // "members" is the default — no param needed for it.
      setSearchParams(id === "members" ? {} : { tab: id }, { replace: true });

   // Announcements tab state — fetched lazily, only once the tab is opened.
   const [notices, setNotices] = useState(null);
   const [noticesViewer, setNoticesViewer] = useState(null);
   const [noticesPage, setNoticesPage] = useState(1);
   const [noticesLoadedKey, setNoticesLoadedKey] = useState(null);

   // Events tab state
   const [eventsWhen, setEventsWhen] = useState("all");
   const [eventsSort, setEventsSort] = useState("new");
   const [events, setEvents] = useState(null);
   const [eventsViewer, setEventsViewer] = useState(null);
   const [eventsLoadedKey, setEventsLoadedKey] = useState(null);
   const [regBusyId, setRegBusyId] = useState(null);

   // Members tab state
   const [search, setSearch] = useState("");
   const debounced = useDebounced(search.trim());
   const [roleFilter, setRoleFilter] = useState("");
   const [sort, setSort] = useState("role");
   const [page, setPage] = useState(1);
   const [members, setMembers] = useState(null);
   const [membersLoadedKey, setMembersLoadedKey] = useState(null);
   // One counter per fetcher: a newer request for the same list invalidates the older.
   const startClubRequest = useLatestRequest();
   const startRolesRequest = useLatestRequest();
   const startNoticesRequest = useLatestRequest();
   const startEventsRequest = useLatestRequest();
   const startMembersRequest = useLatestRequest();

   // Roles — drive the badges, the role filter, and the Roles tab.
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


   const refetchClub = useCallback(() => {
      const isCurrent = startClubRequest();
      clubsApi
         .getClub(slug)
         .then((d) => isCurrent() && setClub(d))
         .catch((err) => {
            toast.error(
               err instanceof ApiError ? err.message : "Couldn't load club",
            );
            setClub(null);
         })
         .finally(() => setClubLoadedSlug(slug));
   }, [slug, toast, startClubRequest]);

   useEffect(() => {
      refetchClub();
   }, [refetchClub]);

   const refetchRoles = useCallback(() => {
      const isCurrent = startRolesRequest();
      clubsApi
         .listRoles(slug)
         .then((d) => {
            if (!isCurrent()) return;
            setRoles(d.items || []);
            setRolesViewer(d.viewer || null);
         })
         .catch(() => {
            if (!isCurrent()) return;
            setRoles([]);
            setRolesViewer(null);
         });
   }, [slug, startRolesRequest]);

   useEffect(() => {
      refetchRoles();
   }, [refetchRoles]);

   // Only fetched once the tab is opened — most visitors never look at the board.
   const noticesKey = `${slug}|${noticesPage}`;
   const noticesLoading = tab === "announcements" && noticesLoadedKey !== noticesKey;

   const refetchNotices = useCallback(() => {
      const isCurrent = startNoticesRequest();
      announcementsApi
         .listClubAnnouncements(slug, { page: noticesPage, limit: NOTICES_PAGE })
         .then((d) => {
            if (!isCurrent()) return;
            setNotices(d);
            setNoticesViewer(d.viewer || null);
         })
         .catch(() => isCurrent() && setNotices({ items: [], pagination: { total: 0 } }))
         .finally(() => setNoticesLoadedKey(`${slug}|${noticesPage}`));
   }, [slug, noticesPage, startNoticesRequest]);

   useEffect(() => {
      if (tab !== "announcements") return;
      refetchNotices();
   }, [tab, refetchNotices]);

   const eventsKey = `${slug}|${eventsWhen}|${eventsSort}`;
   const eventsLoading = eventsLoadedKey !== eventsKey;

   const refetchEvents = useCallback(() => {
      const isCurrent = startEventsRequest();
      eventsApi
         .listClubEvents(slug, { when: eventsWhen, sort: eventsSort, limit: 50 })
         .then((d) => {
            if (!isCurrent()) return;
            setEvents(d);
            setEventsViewer(d.viewer || null);
         })
         .catch((err) => {
            if (!isCurrent()) return;
            toast.error(
               err instanceof ApiError ? err.message : "Couldn't load events",
            );
            setEvents({ items: [], pagination: { total: 0 } });
         })
         .finally(() => setEventsLoadedKey(`${slug}|${eventsWhen}|${eventsSort}`));
   }, [slug, eventsWhen, eventsSort, toast, startEventsRequest]);

   useEffect(() => {
      refetchEvents();
   }, [refetchEvents]);

   // Register / leave both refetch — the counters and the waitlist move server-side.
   async function handleRegister(event) {
      setRegBusyId(event.id);
      try {
         const res = await eventsApi.registerForEvent(event.id);
         toast.success(
            res?.registration?.status === "waitlisted"
               ? "Added to the waitlist"
               : "You're registered",
         );
         refetchEvents();
      } catch (err) {
         toast.error(
            err instanceof ApiError ? err.message : "Couldn't register",
         );
      } finally {
         setRegBusyId(null);
      }
   }

   async function handleLeaveEvent(event) {
      const ok = await confirm({
         title: `Cancel your spot at “${event.title}”?`,
         message: "Your seat goes to the next person on the waitlist.",
         confirmLabel: "Cancel registration",
         danger: true,
      });
      if (!ok) return;
      setRegBusyId(event.id);
      try {
         await eventsApi.unregisterFromEvent(event.id);
         toast.success("Registration cancelled");
         refetchEvents();
      } catch (err) {
         toast.error(err instanceof ApiError ? err.message : "Couldn't cancel");
      } finally {
         setRegBusyId(null);
      }
   }

   const fetchMembers = useCallback(() => {
      const isCurrent = startMembersRequest();
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
            if (!isCurrent()) return;
            setMembers(d);
         })
         .catch((err) => {
            if (!isCurrent()) return;
            toast.error(
               err instanceof ApiError ? err.message : "Couldn't load members",
            );
            setMembers({
               items: [],
               pagination: { page, limit: PAGE_SIZE, total: 0, hasMore: false },
            });
         })
         .finally(() => {
            if (isCurrent()) setMembersLoadedKey(myKey);
         });
   }, [slug, debounced, roleFilter, sort, page, toast, startMembersRequest]);

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
            <div className="main club-detail">
               <HeaderSkeleton />
            </div>
         </AppShell>
      );
   }

   if (!club) {
      return (
         <AppShell title="Club">
            <div className="main club-detail">
               <div className="profile-empty">
                  Club not found.{" "}
                  {clubsListHref(user?.role) && (
                     <Link
                        to={clubsListHref(user?.role)}
                        style={{ color: "var(--accent-purple)" }}
                     >
                        Back to clubs
                     </Link>
                  )}
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
            <div className="main club-detail">
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

   // Following is separate from joining: no approval, and all it does is put you on
   // the club's email list for public announcements.
   async function toggleFollow() {
      setFollowBusy(true);
      try {
         const d = club.isFollowing
            ? await clubsApi.unfollowClub(slug)
            : await clubsApi.followClub(slug);
         setClub((c) =>
            c
               ? { ...c, isFollowing: d.following, followerCount: d.followerCount }
               : c,
         );
         toast.success(d.following ? "Following this club" : "Unfollowed");
      } catch (err) {
         toast.error(err instanceof ApiError ? err.message : "Couldn't update");
      } finally {
         setFollowBusy(false);
      }
   }
   function onJoinClick() {
      if (joinKind === "leave") handleLeave();
      else if (joinKind === "join") handleJoin();
   }
   // Only students join or leave a club; staff coordinate one.
   const showJoinButton = isStudent;

   const items = members?.items || [];

   return (
      <AppShell title="Club" subtitle={club.name}>
         <div className="main club-detail">
            {/* BANNER */}
            <div className="club-banner" />

            {/* IDENTITY */}
            <div className="club-id">
               <div
                  className="club-id-logo"
                  style={{ background: gradient(club) }}
               >
                  {initials(club.name)}
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
                  {(user?.role === "superAdmin" ||
                     rolesViewer?.canEditClub) && (
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
                  {/* The board is members-only, so the link only shows to members
                      (a superAdmin oversees every club and gets it too). */}
                  {(memberStatus === "approved" ||
                     user?.role === "superAdmin") && (
                     <Link
                        className="btn btn-secondary"
                        to={`/clubs/${slug}/announcements`}
                     >
                        <Icon size={14} strokeWidth={2.2}>
                           <path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1z" />
                           <path d="M16 9a3 3 0 0 1 0 6" />
                        </Icon>
                        Announcements
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
                  {/* Students only — staff run clubs rather than subscribe to them. */}
                  {isStudent && (
                     <button
                        type="button"
                        className={`follow-btn${club.isFollowing ? " on" : ""}`}
                        disabled={followBusy}
                        onClick={toggleFollow}
                        title={
                           club.isFollowing
                              ? "You get emails about this club's public announcements"
                              : "Get emails about this club's public announcements"
                        }
                     >
                        <Icon size={13} strokeWidth={2.4}>
                           <path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1z" />
                           <path d="M16 9a3 3 0 0 1 0 6" />
                        </Icon>
                        {followBusy
                           ? "…"
                           : club.isFollowing
                             ? "Following"
                             : "Follow"}
                        {club.followerCount > 0 && (
                           <span className="follow-count">
                              {club.followerCount}
                           </span>
                        )}
                     </button>
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
               <div
                  className={`ct-tab${tab === "events" ? " active" : ""}`}
                  onClick={() => setTab("events")}
               >
                  <Icon size={13} strokeWidth={2.2}>
                     <rect x="3" y="4" width="18" height="18" rx="2" />
                     <line x1="16" y1="2" x2="16" y2="6" />
                     <line x1="8" y1="2" x2="8" y2="6" />
                     <line x1="3" y1="10" x2="21" y2="10" />
                  </Icon>
                  Events
                  <span className="count">
                     {events?.pagination?.total ?? 0}
                  </span>
               </div>
               <div
                  className={`ct-tab${tab === "announcements" ? " active" : ""}`}
                  onClick={() => setTab("announcements")}
               >
                  <Icon size={13} strokeWidth={2.2}>
                     <path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1z" />
                     <path d="M16 9a3 3 0 0 1 0 6" />
                  </Icon>
                  Announcements
                  {notices?.pagination?.total > 0 && (
                     <span className="count">{notices.pagination.total}</span>
                  )}
               </div>
            </div>

            {/* MEMBERS TAB */}
            {tab === "members" && (
               <div className="tab-pane active">
                  <div className="member-list">
                     <div className="ml-head">
                        <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                           {pagination?.total ?? 0} members
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
                           <FilterSelect
                              label="Sort"
                              value={sort}
                              onChange={setSort}
                              options={MEMBER_SORTS}
                              ariaLabel="Sort members"
                              withIcon
                           />
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

            {/* EVENTS TAB */}
            {/* ANNOUNCEMENTS TAB — read-only here; posting lives on the board page. */}
            {tab === "announcements" && (
               <div className="tab-pane active">
                  <div className="ev-head">
                     <div>
                        <div className="panel-title">Announcements</div>
                        <div className="panel-sub">
                           {noticesViewer && !noticesViewer.isMember
                              ? "Public notices — join the club to see members-only ones."
                              : "Everything this club has posted, pinned first."}
                        </div>
                     </div>
                     {noticesViewer?.canPost && (
                        <Link
                           className="btn btn-secondary"
                           to={`/clubs/${slug}/announcements`}
                        >
                           Manage board
                        </Link>
                     )}
                  </div>

                  {noticesLoading && !notices ? (
                     <LoadingBlock label="Loading announcements" size={22} />
                  ) : (notices?.items || []).length === 0 ? (
                     <div className="ev-empty">
                        {noticesViewer && !noticesViewer.isMember
                           ? "No public announcements yet."
                           : "Nothing posted yet."}
                     </div>
                  ) : (
                     <div className="an-list">
                        {notices.items.map((a) => (
                           <article
                              key={a.id}
                              className={`an-card${a.pinned ? " pinned" : ""}`}
                           >
                              <div className="an-card-head">
                                 <div className="an-avatar">
                                    {initials(a.author?.name || "?")}
                                 </div>
                                 <div className="an-byline">
                                    <div className="an-title">
                                       {a.pinned && (
                                          <span className="an-pin" title="Pinned">
                                             <Icon size={13} strokeWidth={2.2}>
                                                <line x1="12" y1="17" x2="12" y2="22" />
                                                <path d="M9 2h6l-1 6 3 3v2H7v-2l3-3z" />
                                             </Icon>
                                          </span>
                                       )}
                                       {a.title}
                                    </div>
                                    <div className="an-meta">
                                       <span className={`an-vis-tag ${a.visibility}`}>
                                          {a.visibility === "public"
                                             ? "Everyone"
                                             : "Members only"}
                                       </span>
                                       <span className="sep">·</span>
                                       {a.author?.name || "Unknown"}
                                       <span className="sep">·</span>
                                       {postedAt(a.createdAt)}
                                    </div>
                                 </div>
                              </div>
                              <div className="an-body">{a.body}</div>
                           </article>
                        ))}
                     </div>
                  )}

                  {(notices?.pagination?.total ?? 0) > NOTICES_PAGE && (
                     <Pagination
                        page={noticesPage}
                        totalPages={Math.max(
                           1,
                           Math.ceil(notices.pagination.total / NOTICES_PAGE),
                        )}
                        perPage={NOTICES_PAGE}
                        hasMore={notices.pagination.hasMore}
                        onChange={setNoticesPage}
                     />
                  )}
               </div>
            )}

            {tab === "events" && (
               <div className="tab-pane active">
                  <div className="ev-head">
                     <div>
                        <div className="panel-title">
                           Upcoming &amp; recent events
                        </div>
                        <div className="panel-sub">
                           {events?.pagination?.total ?? 0} event
                           {events?.pagination?.total === 1 ? "" : "s"}
                           {eventsViewer?.canCreate
                              ? " · drafts are visible to you only"
                              : ""}
                        </div>
                     </div>
                     <div className="tabs">
                        {["all", "upcoming", "past"].map((w) => (
                           <button
                              key={w}
                              type="button"
                              className={`tab${eventsWhen === w ? " active" : ""}`}
                              onClick={() => setEventsWhen(w)}
                           >
                              {w[0].toUpperCase() + w.slice(1)}
                           </button>
                        ))}
                     </div>
                     <FilterSelect
                        label="Sort"
                        value={eventsSort}
                        onChange={setEventsSort}
                        options={EVENT_SORTS}
                        ariaLabel="Sort events"
                        withIcon
                     />
                     {eventsViewer?.canCreate && (
                        <Link
                           className="btn btn-primary"
                           to={`/clubs/${slug}/events/new`}
                        >
                           <Icon size={14} strokeWidth={2.5}>
                              <line x1="12" y1="5" x2="12" y2="19" />
                              <line x1="5" y1="12" x2="19" y2="12" />
                           </Icon>
                           New event
                        </Link>
                     )}
                  </div>

                  {eventsLoading && !events ? (
                     <LoadingBlock label="Loading events" size={22} />
                  ) : (events?.items || []).length === 0 ? (
                     <div className="ev-empty">
                        No {eventsWhen === "all" ? "" : eventsWhen} events yet.
                     </div>
                  ) : (
                     <div className="event-grid">
                        {events.items.map((e) => (
                           <EventCard
                              key={e.id}
                              event={e}
                              showStatus
                              busy={regBusyId === e.id}
                              onRegister={isStudent ? handleRegister : undefined}
                              onLeave={isStudent ? handleLeaveEvent : undefined}
                              onOpen={(ev) => navigate(`/events/${ev.id}`)}
                           />
                        ))}
                     </div>
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
