import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { clubsApi, ApiError } from "../services";
import AppShell from "../components/layout/AppShell";
import Icon from "../components/Icon";
import { LoadingBlock } from "../components/Spinner";
import Pagination from "../components/Pagination";
import { useToast } from "../contexts/ToastContext";
import { useConfirm } from "../contexts/ConfirmContext";

// Category chips — order + emoji + cover gradient palette mirror .design/Clubs.html.
const CATEGORIES = [
   { id: "all", label: "All", emoji: null, from: null, to: null },
   {
      id: "tech",
      label: "Tech & CS",
      emoji: "💻",
      from: "#4c1d95",
      to: "#6c63ff",
   },
   {
      id: "design",
      label: "Design",
      emoji: "🎨",
      from: "#f59e0b",
      to: "#fcd34d",
   },
   {
      id: "culture",
      label: "Culture",
      emoji: "🎭",
      from: "#991b1b",
      to: "#ef4444",
   },
   {
      id: "sports",
      label: "Sports",
      emoji: "⚽",
      from: "#064e3b",
      to: "#34d399",
   },
   {
      id: "business",
      label: "Business",
      emoji: "📈",
      from: "#4338ca",
      to: "#818cf8",
   },
   { id: "media", label: "Media", emoji: "📷", from: "#831843", to: "#ec4899" },
   {
      id: "social",
      label: "Social",
      emoji: "🤝",
      from: "#0e7490",
      to: "#22d3ee",
   },
   { id: "other", label: "Other", emoji: "✨", from: "#475569", to: "#94a3b8" },
];

const SORTS = [
   { id: "popular", label: "Popularity" },
   { id: "new", label: "Newest first" },
   { id: "active", label: "Most active" },
   { id: "name", label: "A → Z" },
];

const POLICY_LABEL = {
   open: "Open join",
   request: "Approval needed",
   "invite-only": "Invite-only",
};

const PAGE_SIZE_OPTIONS = [10, 20, 50];

function clubInitials(name = "") {
   const parts = name.trim().split(/\s+/);
   return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

function categoryMeta(id) {
   return CATEGORIES.find((c) => c.id === id) || CATEGORIES[0];
}

function coverGradient(club) {
   const cat = categoryMeta(club.category);
   const from = club.coverFrom || cat.from || "#4c1d95";
   const to = club.coverTo || cat.to || "#6c63ff";
   return `linear-gradient(135deg, ${from}, ${to})`;
}

function joinButtonState(club) {
   if (club.membershipStatus === "approved")
      return { label: "Leave", cls: "member" };
   if (club.membershipStatus === "pending")
      return { label: "Pending", cls: "pending" };
   if (club.joinPolicy === "invite-only")
      return { label: "Invite-only", cls: "disabled" };
   if (club.joinPolicy === "request")
      return { label: "Request to join", cls: "" };
   return { label: "Join", cls: "" };
}

function MemberIcon() {
   return (
      <Icon size={11}>
         <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
         <circle cx="9" cy="7" r="4" />
      </Icon>
   );
}
function CalendarIcon() {
   return (
      <Icon size={11}>
         <rect x="3" y="4" width="18" height="18" rx="2" />
         <line x1="16" y1="2" x2="16" y2="6" />
         <line x1="8" y1="2" x2="8" y2="6" />
      </Icon>
   );
}

// Sits next to Join on both the card and the row. Stops the click reaching the
// surrounding <Link> so following doesn't also navigate into the club.
function FollowButton({ club, onFollow, busy }) {
   return (
      <button
         type="button"
         className={`follow-btn sm${club.isFollowing ? " on" : ""}`}
         disabled={busy}
         title={
            club.isFollowing
               ? "You get emails about this club's public announcements"
               : "Get emails about this club's public announcements"
         }
         onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!busy) onFollow(club);
         }}
      >
         <Icon size={12} strokeWidth={2.4}>
            <path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1z" />
            <path d="M16 9a3 3 0 0 1 0 6" />
         </Icon>
         {busy ? "…" : club.isFollowing ? "Following" : "Follow"}
      </button>
   );
}

function ClubCard({ club, onJoin, onLeave, onFollow, busy, followBusy }) {
   const btn = joinButtonState(club);
   const cat = categoryMeta(club.category);
   const handleClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (busy || btn.cls === "disabled") return;
      if (club.membershipStatus === "approved") onLeave(club);
      else if (club.membershipStatus !== "pending") onJoin(club);
   };
   return (
      <Link to={`/clubs/${club.slug}`} className="club-card">
         <div
            className="club-cover"
            style={{ background: coverGradient(club) }}
         >
            <div className="cover-bg" />
            <span className="domain-tag">{cat.label}</span>
            {club.isPrivate && (
               <span className="private-tag" title="Private club">
                  <Icon size={9} strokeWidth={2.5}>
                     <rect x="3" y="11" width="18" height="11" rx="2" />
                     <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </Icon>
                  Private
               </span>
            )}
            <div
               className="club-logo-lg"
               style={{ background: coverGradient(club) }}
            >
               {club.logoUrl ? (
                  <img src={club.logoUrl} alt="" />
               ) : (
                  clubInitials(club.name)
               )}
            </div>
         </div>
         <div className="club-body">
            <div className="club-head-row">
               <div className="club-name">{club.name}</div>
               {club.verified && (
                  <span className="verified-tick" title="Verified by institute">
                     <Icon size={9} strokeWidth={4}>
                        <polyline points="20 6 9 17 4 12" />
                     </Icon>
                  </span>
               )}
            </div>
            <div className="club-tagline">
               {club.tagline || club.description}
            </div>
            <div className="club-meta">
               <span>
                  <MemberIcon /> <b>{club.memberCount}</b> members
               </span>
               <span>
                  <CalendarIcon /> <b>{club.eventCount}</b> events
               </span>
               {club.foundedYear && (
                  <span>
                     Est. <b>{club.foundedYear}</b>
                  </span>
               )}
            </div>
            {club.tags?.length > 0 && (
               <div className="club-tags">
                  {club.tags.slice(0, 4).map((t) => (
                     <span key={t} className="club-tag">
                        {t}
                     </span>
                  ))}
               </div>
            )}
            <div className="club-foot">
               <span className={`club-policy ${club.joinPolicy}`}>
                  <span className="dot" />
                  {POLICY_LABEL[club.joinPolicy] || club.joinPolicy}
               </span>
               <FollowButton
                  club={club}
                  onFollow={onFollow}
                  busy={followBusy}
               />
               <button
                  type="button"
                  className={`join-btn ${btn.cls}`}
                  onClick={handleClick}
                  disabled={
                     busy ||
                     btn.cls === "disabled" ||
                     club.membershipStatus === "pending"
                  }
               >
                  {busy ? "…" : btn.label}
               </button>
            </div>
         </div>
      </Link>
   );
}

function ClubRow({ club, onJoin, onLeave, onFollow, busy, followBusy }) {
   const btn = joinButtonState(club);
   const cat = categoryMeta(club.category);
   const handleClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (busy || btn.cls === "disabled") return;
      if (club.membershipStatus === "approved") onLeave(club);
      else if (club.membershipStatus !== "pending") onJoin(club);
   };
   return (
      <Link to={`/clubs/${club.slug}`} className="club-row">
         <div
            className="club-row-logo"
            style={{ background: coverGradient(club) }}
         >
            {club.logoUrl ? (
               <img src={club.logoUrl} alt="" />
            ) : (
               clubInitials(club.name)
            )}
         </div>
         <div className="cr-info">
            <div className="cr-name-row">
               <div className="cr-name">{club.name}</div>
               <div className="cr-domain">{cat.label}</div>
               {club.verified && (
                  <span className="verified-tick" title="Verified">
                     <Icon size={9} strokeWidth={4}>
                        <polyline points="20 6 9 17 4 12" />
                     </Icon>
                  </span>
               )}
               {club.isPrivate && (
                  <span className="cr-private" title="Private club">
                     <Icon size={9} strokeWidth={2.5}>
                        <rect x="3" y="11" width="18" height="11" rx="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                     </Icon>
                     Private
                  </span>
               )}
            </div>
            <div className="cr-tagline">{club.tagline || club.description}</div>
         </div>
         <div className="cr-stat">
            Members<b>{club.memberCount}</b>
         </div>
         <div className="cr-stat">
            Events<b>{club.eventCount}</b>
         </div>
         <FollowButton club={club} onFollow={onFollow} busy={followBusy} />
         <button
            type="button"
            className={`join-btn ${btn.cls}`}
            onClick={handleClick}
            disabled={
               busy ||
               btn.cls === "disabled" ||
               club.membershipStatus === "pending"
            }
         >
            {busy ? "…" : btn.label}
         </button>
      </Link>
   );
}

export default function Clubs() {
   const [search, setSearch] = useState("");
   const [debounced, setDebounced] = useState("");
   const [category, setCategory] = useState("all");
   const [sort, setSort] = useState("popular");
   const [view, setView] = useState("grid"); // grid | list
   const [page, setPage] = useState(1);
   const [perPage, setPerPage] = useState(PAGE_SIZE_OPTIONS[0]);
   const [data, setData] = useState(null);
   const [busyId, setBusyId] = useState(null);
   const [followBusyId, setFollowBusyId] = useState(null);
   const [loadedKey, setLoadedKey] = useState(null);
   const toast = useToast();
   const confirm = useConfirm();
   const reqIdRef = useRef(0);

   // Derive loading instead of setting it in the fetch effect: we're loading
   // whenever the data on screen doesn't match the current filter/page.
   const currentKey = `${debounced}|${category}|${sort}|${page}|${perPage}`;
   const loading = loadedKey !== currentKey;

   useEffect(() => {
      const id = setTimeout(() => setDebounced(search.trim()), 300);
      return () => clearTimeout(id);
   }, [search]);

   // Reset to page 1 when filters change
   const [prevFilters, setPrevFilters] = useState({
      debounced,
      category,
      sort,
      perPage,
   });
   if (
      prevFilters.debounced !== debounced ||
      prevFilters.category !== category ||
      prevFilters.sort !== sort ||
      prevFilters.perPage !== perPage
   ) {
      setPrevFilters({ debounced, category, sort, perPage });
      setPage(1);
   }

   // Only keep the latest request's response, ignore the rest (e.g. from a stale filter state).
   const fetchClubs = useCallback(() => {
      const myReqId = ++reqIdRef.current;
      const myKey = `${debounced}|${category}|${sort}|${page}|${perPage}`;
      clubsApi
         .listClubs({
            q: debounced || undefined,
            category: category === "all" ? undefined : category,
            sort,
            page,
            limit: perPage,
         })
         .then((d) => {
            if (myReqId !== reqIdRef.current) return;
            setData(d);
         })
         .catch((err) => {
            if (myReqId !== reqIdRef.current) return;
            toast.error(
               err instanceof ApiError ? err.message : "Couldn't load clubs",
            );
            setData({
               items: [],
               categoryCounts: {},
               pagination: { page, limit: perPage, total: 0, hasMore: false },
            });
         })
         .finally(() => {
            if (myReqId === reqIdRef.current) setLoadedKey(myKey);
         });
   }, [debounced, category, sort, page, perPage, toast]);

   useEffect(() => {
      fetchClubs();
   }, [fetchClubs]);

   const items = data?.items || [];
   const categoryCounts = data?.categoryCounts || {};
   const pagination = data?.pagination;
   const showEmpty = !loading && items.length === 0;

   const totalPages = useMemo(() => {
      if (!pagination) return 1;
      return Math.max(1, Math.ceil(pagination.total / pagination.limit));
   }, [pagination]);

   // Mutate one card in-place so the rest of the page doesn't flash.
   function patchClub(slug, patch) {
      setData((d) => {
         if (!d) return d;
         return {
            ...d,
            items: d.items.map((c) =>
               c.slug === slug ? { ...c, ...patch } : c,
            ),
         };
      });
   }

   // Follow is a one-tap subscription — no confirm, no approval. It only decides
   // whether you get emailed about the club's public announcements.
   async function handleFollow(club) {
      setFollowBusyId(club.id);
      try {
         const res = club.isFollowing
            ? await clubsApi.unfollowClub(club.slug)
            : await clubsApi.followClub(club.slug);
         patchClub(club.slug, {
            isFollowing: res.following,
            followerCount: res.followerCount,
         });
      } catch (err) {
         toast.error(
            err instanceof ApiError ? err.message : "Couldn't update follow",
         );
      } finally {
         setFollowBusyId(null);
      }
   }

   async function handleJoin(club) {
      const isRequest = club.joinPolicy === "request";
      const ok = await confirm({
         title: isRequest
            ? `Request to join ${club.name}?`
            : `Join ${club.name}?`,
         message: isRequest
            ? "A club coordinator will review your request before you're added."
            : "You'll be added to the club and can access members-only posts and events.",
         confirmLabel: isRequest ? "Send request" : "Join club",
      });
      if (!ok) return;
      setBusyId(club.id);
      try {
         const res = await clubsApi.joinClub(club.slug);
         if (res.status === "approved") {
            patchClub(club.slug, {
               membershipStatus: "approved",
               memberCount: club.memberCount + 1,
            });
            toast.success(`Joined ${club.name}`);
         } else {
            patchClub(club.slug, { membershipStatus: "pending" });
            toast.success("Request sent — club coordinator will review it");
         }
      } catch (err) {
         toast.error(
            err instanceof ApiError ? err.message : "Couldn't join club",
         );
      } finally {
         setBusyId(null);
      }
   }

   async function handleLeave(club) {
      const ok = await confirm({
         title: `Leave ${club.name}?`,
         message: "You'll lose access to members-only posts and events.",
         confirmLabel: "Leave club",
         danger: true,
      });
      if (!ok) return;
      setBusyId(club.id);
      try {
         await clubsApi.leaveClub(club.slug);
         patchClub(club.slug, {
            membershipStatus: "left",
            memberCount: Math.max(0, club.memberCount - 1),
         });
         toast.success(`You left ${club.name}`);
      } catch (err) {
         toast.error(
            err instanceof ApiError ? err.message : "Couldn't leave club",
         );
      } finally {
         setBusyId(null);
      }
   }

   const rangeStart = pagination
      ? (pagination.page - 1) * pagination.limit + 1
      : 0;
   const rangeEnd = pagination ? rangeStart + items.length - 1 : 0;

   return (
      <AppShell title="Clubs">
         <div className="main">
            {/* HERO */}
            <div className="clubs-hero">
               <div className="hero-inner">
                  <h1>
                     Find your <em>people</em>.
                  </h1>
                  <p>
                     From coding to culture, photography to physics — clubs you
                     haven't joined yet. The ones you're in live on{" "}
                     <Link to="/my-clubs">My Clubs</Link>.
                  </p>
                  <div className="hero-search">
                     <Icon size={16}>
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                     </Icon>
                     <input
                        placeholder="Search clubs by name, description, or tag…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                     />
                     {search && (
                        <button
                           type="button"
                           className="hero-search-clear"
                           onClick={() => setSearch("")}
                           aria-label="Clear"
                        >
                           <Icon size={14}>
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                           </Icon>
                        </button>
                     )}
                  </div>
               </div>
            </div>

            {/* FILTERS */}
            <div className="filter-bar">
               {CATEGORIES.map((c) => {
                  const n =
                     c.id === "all" ? categoryCounts.all : categoryCounts[c.id];
                  return (
                     <button
                        type="button"
                        key={c.id}
                        className={`filter-chip${category === c.id ? " active" : ""}`}
                        onClick={() => setCategory(c.id)}
                     >
                        {c.emoji && <span className="em">{c.emoji}</span>}
                        {c.label}
                        {typeof n === "number" && (
                           <span className="count">{n}</span>
                        )}
                     </button>
                  );
               })}
               <div className="sort-wrap">
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
                     >
                        {SORTS.map((s) => (
                           <option key={s.id} value={s.id}>
                              {s.label}
                           </option>
                        ))}
                     </select>
                  </div>
                  <div className="view-toggle">
                     <button
                        type="button"
                        className={`vt-btn${view === "grid" ? " active" : ""}`}
                        onClick={() => setView("grid")}
                        title="Grid"
                     >
                        <Icon size={13}>
                           <rect x="3" y="3" width="7" height="7" />
                           <rect x="14" y="3" width="7" height="7" />
                           <rect x="14" y="14" width="7" height="7" />
                           <rect x="3" y="14" width="7" height="7" />
                        </Icon>
                     </button>
                     <button
                        type="button"
                        className={`vt-btn${view === "list" ? " active" : ""}`}
                        onClick={() => setView("list")}
                        title="List"
                     >
                        <Icon size={13}>
                           <line x1="8" y1="6" x2="21" y2="6" />
                           <line x1="8" y1="12" x2="21" y2="12" />
                           <line x1="8" y1="18" x2="21" y2="18" />
                           <circle cx="4" cy="6" r="1" />
                           <circle cx="4" cy="12" r="1" />
                           <circle cx="4" cy="18" r="1" />
                        </Icon>
                     </button>
                  </div>
               </div>
            </div>

            {pagination && pagination.total > 0 && (
               <div className="results-count">
                  Showing{" "}
                  <b>
                     {rangeStart}–{rangeEnd}
                  </b>{" "}
                  of <b>{pagination.total}</b> clubs
               </div>
            )}

            {loading && !data ? (
               <LoadingBlock label="Loading clubs" size={28} />
            ) : showEmpty ? (
               <div className="profile-empty">
                  No clubs match your search. Try a different name or category.
               </div>
            ) : view === "grid" ? (
               <div className={`clubs-grid${loading ? " is-refetching" : ""}`}>
                  {items.map((c) => (
                     <ClubCard
                        key={c.id}
                        club={c}
                        onJoin={handleJoin}
                        onLeave={handleLeave}
                        onFollow={handleFollow}
                        busy={busyId === c.id}
                        followBusy={followBusyId === c.id}
                     />
                  ))}
               </div>
            ) : (
               <div className={`clubs-list${loading ? " is-refetching" : ""}`}>
                  {items.map((c) => (
                     <ClubRow
                        key={c.id}
                        club={c}
                        onJoin={handleJoin}
                        onLeave={handleLeave}
                        onFollow={handleFollow}
                        busy={busyId === c.id}
                        followBusy={followBusyId === c.id}
                     />
                  ))}
               </div>
            )}

            {items.length > 0 && (
               <Pagination
                  page={page}
                  totalPages={totalPages}
                  perPage={perPage}
                  perPageOptions={PAGE_SIZE_OPTIONS}
                  onPerPageChange={setPerPage}
                  hasMore={pagination?.hasMore}
                  onChange={setPage}
               />
            )}
         </div>
      </AppShell>
   );
}
