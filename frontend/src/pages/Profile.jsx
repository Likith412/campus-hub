// Profile page — /profile is your own, /u/:handle is anyone else's. Every signed-in
// user can open any profile; the account controls strip below the hero only renders
// for a superAdmin, who can activate or deactivate the account from here.
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { profileApi, adminApi, ApiError } from "../services";
import { useAuth } from "../contexts/AuthContext";
import AppShell from "../components/layout/AppShell";
import Icon from "../components/Icon";
import Spinner, { LoadingBlock } from "../components/Spinner";
import Pagination from "../components/Pagination";
import { useToast } from "../contexts/ToastContext";
import { useConfirm } from "../contexts/ConfirmContext";
import { clubHref } from "../utils/nav";
import { initials } from "../utils/text";
import {
   EVENT_TYPE_LABEL,
   eventDateParts,
   formatEventWhen,
   formatVenue,
} from "../utils/events";

const YEAR_LABEL = {
   1: "1st year",
   2: "2nd year",
   3: "3rd year",
   4: "Final year",
   postgrad: "Postgrad",
};
const ROLE_LABEL = {
   student: "Student",
   faculty: "Faculty",
   superAdmin: "Super admin",
};

// Cover/avatar gradients are picked from the name so every profile looks distinct
// without anyone having to upload anything.
const COVERS = [
   ["#6366f1", "#a78bfa"],
   ["#0ea5e9", "#22d3ee"],
   ["#f59e0b", "#fb7185"],
   ["#10b981", "#34d399"],
   ["#8b5cf6", "#ec4899"],
   ["#ef4444", "#f97316"],
   ["#3b82f6", "#6366f1"],
   ["#14b8a6", "#84cc16"],
];
function coverFor(seed = "") {
   let h = 0;
   for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
   return COVERS[h % COVERS.length];
}

function levelLabel(level) {
   if (level >= 75) return "Advanced";
   if (level >= 50) return "Intermediate";
   return "Beginner";
}

function monthYear(d) {
   if (!d) return "—";
   return new Date(d).toLocaleDateString("en-IN", {
      month: "short",
      year: "numeric",
   });
}

function fullDate(d) {
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
   const m = 60000,
      h = 3600000,
      day = 86400000;
   if (diff < m) return "Just now";
   if (diff < h) return `${Math.floor(diff / m)} min ago`;
   if (diff < day) return `${Math.floor(diff / h)} hr ago`;
   if (diff < 7 * day) return `${Math.floor(diff / day)} days ago`;
   return fullDate(d);
}

const LINK_ICONS = {
   LinkedIn: (
      <>
         <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
         <rect x="2" y="9" width="4" height="12" />
         <circle cx="4" cy="4" r="2" />
      </>
   ),
   GitHub: (
      <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
   ),
   Portfolio: (
      <>
         <circle cx="12" cy="12" r="10" />
         <line x1="2" y1="12" x2="22" y2="12" />
         <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </>
   ),
};

function ProfileLinks({ profile }) {
   const links = [
      profile?.linkedinUrl && { label: "LinkedIn", url: profile.linkedinUrl },
      profile?.githubUrl && { label: "GitHub", url: profile.githubUrl },
      profile?.portfolioUrl && {
         label: "Portfolio",
         url: profile.portfolioUrl,
      },
   ].filter(Boolean);
   if (links.length === 0) return null;
   return (
      <div className="profile-links">
         {links.map(({ label, url }) => (
            <a
               key={label}
               className="profile-link"
               href={url}
               target="_blank"
               rel="noopener noreferrer"
            >
               <Icon size={13} strokeWidth={2}>
                  {LINK_ICONS[label]}
               </Icon>
               {label}
            </a>
         ))}
      </div>
   );
}

function StatCard({ tone, label, value, children }) {
   return (
      <div className="fac-stat">
         <div className={`fac-stat-ic ${tone}`}>{children}</div>
         <div>
            <div className="fac-stat-label">{label}</div>
            <div className="fac-stat-value">{value}</div>
         </div>
      </div>
   );
}

// Label/value rows in the About panel — skipped entirely when the value is empty.
function Fact({ label, value, href }) {
   if (!value) return null;
   return (
      <div className="pr-fact">
         <div className="pr-fact-label">{label}</div>
         <div className="pr-fact-value">
            {href ? (
               <a href={href} className="pr-fact-link">
                  {value}
               </a>
            ) : (
               value
            )}
         </div>
      </div>
   );
}

// ──────────────────────────────────────────────────────────────────────────────
// SuperAdmin-only strip: account state plus the activate/deactivate control.
// ──────────────────────────────────────────────────────────────────────────────
function AdminControls({ user, account, onChanged }) {
   const toast = useToast();
   const confirm = useConfirm();
   const [busy, setBusy] = useState(false);
   const active = account.isActive;

   async function toggle() {
      const ok = await confirm({
         title: active ? `Deactivate ${user.name}?` : `Reactivate ${user.name}?`,
         message: active
            ? "They won't be able to log in until reactivated. Their clubs and registrations are kept."
            : "They'll be able to log in again.",
         confirmLabel: active ? "Deactivate" : "Reactivate",
         danger: active,
      });
      if (!ok) return;
      setBusy(true);
      try {
         await adminApi.setUserActive(user.id, !active);
         onChanged(!active);
         toast.success(active ? "Account deactivated" : "Account reactivated");
      } catch (err) {
         toast.error(
            err instanceof ApiError ? err.message : "Couldn't update account",
         );
      } finally {
         setBusy(false);
      }
   }

   return (
      <div className="pr-admin">
         <div className="pr-admin-ic">
            <Icon size={18} strokeWidth={2.2}>
               <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </Icon>
         </div>
         <div className="pr-admin-meta">
            <div className="pr-admin-title">Admin controls</div>
            <div className="pr-admin-sub">
               Only you can see this. Deactivating blocks sign-in without
               removing their memberships.
            </div>
         </div>
         <div className="pr-admin-facts">
            <div>
               <span>Status</span>
               <b className={active ? "ok" : "off"}>
                  {active ? "Active" : "Deactivated"}
               </b>
            </div>
            <div>
               <span>Last login</span>
               <b>{timeAgo(account.lastLoginAt)}</b>
            </div>
            <div>
               <span>Email</span>
               <b>{account.emailVerified ? "Verified" : "Unverified"}</b>
            </div>
         </div>
         {busy ? (
            <Spinner size={16} />
         ) : (
            <button
               type="button"
               className={`btn ${active ? "btn-danger" : "btn-primary"}`}
               onClick={toggle}
            >
               {active ? "Deactivate" : "Reactivate"}
            </button>
         )}
      </div>
   );
}

// ──────────────────────────────────────────────────────────────────────────────
// Panels
// ──────────────────────────────────────────────────────────────────────────────
// Students see what they registered for; faculty see what their clubs are running.
// Same list, different copy — the caller supplies the wording and the empty-state CTA.
// Page 1 arrives with the profile; later pages are fetched on their own so changing
// page doesn't reload the whole profile.
function EventsPanel({ handle, initial, sub, emptyText, cta }) {
   const [page, setPage] = useState(1);
   const [loaded, setLoaded] = useState(null);

   useEffect(() => {
      if (page === 1) return;
      let cancelled = false;
      profileApi
         .getProfileEvents(handle, page)
         .then((d) => !cancelled && setLoaded({ key: page, data: d }))
         .catch(
            () => !cancelled && setLoaded({ key: page, data: { items: [] } }),
         );
      return () => {
         cancelled = true;
      };
   }, [handle, page]);

   const current =
      page === 1 ? initial : loaded?.key === page ? loaded.data : null;
   const events = current?.items || [];
   const total = initial.pagination?.total ?? events.length;
   const perPage = initial.pagination?.limit || 5;
   const totalPages = Math.max(1, Math.ceil(total / perPage));

   return (
      <div className="panel">
         <div className="panel-head">
            <div>
               <div className="panel-title">Upcoming events</div>
               <div className="panel-sub">{sub}</div>
            </div>
            {total > 0 && <span className="pr-count">{total}</span>}
         </div>
         {current === null ? (
            <LoadingBlock label="Loading events" size={20} />
         ) : events.length === 0 ? (
            <div className="pr-blank">
               <Icon size={20} strokeWidth={1.8}>
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
               </Icon>
               <span>{emptyText}</span>
               {cta}
            </div>
         ) : (
            <>
               {events.map((e) => {
                  const { month, day } = eventDateParts(e.startAt);
                  return (
                     <Link
                        key={e.id}
                        to={`/events/${e.id}`}
                        className="ca-row"
                     >
                        <div className="ev-date">
                           <div className="ev-month">{month}</div>
                           <div className="ev-day">{day}</div>
                        </div>
                        <div>
                           <div className="ca-name">
                              {e.title}
                              {e.visibility === "private" && (
                                 <span className="et-private" title="Members only">
                                    <Icon size={10} strokeWidth={2.6}>
                                       <rect x="3" y="11" width="18" height="11" rx="2" />
                                       <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                    </Icon>
                                 </span>
                              )}
                              <span
                                 className={`badge ${e.eventType}`}
                                 style={{ fontSize: 9.5 }}
                              >
                                 {EVENT_TYPE_LABEL[e.eventType]}
                              </span>
                           </div>
                           <div className="ca-meta">
                              <span>{formatEventWhen(e.startAt, e.endAt)}</span>
                              <span>{formatVenue(e.venue)}</span>
                              {e.club && <span>{e.club.name}</span>}
                           </div>
                        </div>
                        <div className="ca-seats">
                           <div className="ca-seat-num">
                              {e.registeredCount}
                              {e.capacity ? ` / ${e.capacity}` : ""}
                           </div>
                        </div>
                     </Link>
                  );
               })}
            </>
         )}
         {totalPages > 1 && (
            <Pagination
               page={page}
               totalPages={totalPages}
               perPage={perPage}
               onChange={setPage}
            />
         )}
      </div>
   );
}

function ClubsPanel({ clubs, title, sub, emptyText, viewerRole }) {
   return (
      <div className="panel">
         <div className="panel-head">
            <div>
               <div className="panel-title">{title}</div>
               <div className="panel-sub">{sub}</div>
            </div>
            {clubs.length > 0 && (
               <span className="pr-count">{clubs.length}</span>
            )}
         </div>
         {clubs.length === 0 ? (
            <div className="pr-blank">
               <Icon size={20} strokeWidth={1.8}>
                  <rect x="2" y="7" width="20" height="14" rx="2" />
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
               </Icon>
               <span>{emptyText}</span>
            </div>
         ) : (
            <div className="pr-club-grid">
               {clubs.map((c) => (
                  <Link
                     key={c.clubId}
                     to={clubHref(viewerRole, c.slug)}
                     className="pr-club"
                  >
                     <div
                        className="pr-club-logo"
                        style={{
                           background: `linear-gradient(135deg, ${c.coverFrom || "#6366f1"}, ${c.coverTo || "#a78bfa"})`,
                        }}
                     >
                        {(c.name || "?").slice(0, 2).toUpperCase()}
                     </div>
                     <div className="pr-club-body">
                        <div className="pr-club-name">
                           {c.name}
                           {c.verified && (
                              <span
                                 className="verified-tick sm"
                                 title="Verified club"
                              >
                                 <Icon size={9} strokeWidth={3.5}>
                                    <polyline points="20 6 9 17 4 12" />
                                 </Icon>
                              </span>
                           )}
                        </div>
                        <div className="pr-club-meta">
                           {c.memberCount} member{c.memberCount === 1 ? "" : "s"}
                           {c.joinedAt ? ` · joined ${monthYear(c.joinedAt)}` : ""}
                        </div>
                     </div>
                     <span
                        className={`role-tag${c.role === "coordinator" || c.role === "president" ? " admin" : ""}`}
                     >
                        {c.roleName || c.role || "member"}
                     </span>
                  </Link>
               ))}
            </div>
         )}
      </div>
   );
}

// ──────────────────────────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────────────────────────
export default function Profile() {
   const { handle } = useParams();
   const { user: me } = useAuth();
   const toast = useToast();
   // One slot holding the fetch result *and* the handle it belongs to, so switching
   // profiles falls back to the loading state without a setState inside the effect.
   const [loaded, setLoaded] = useState(null);

   // /profile has no param — fall back to whoever is signed in.
   const target = handle || me?.username || me?.id;

   useEffect(() => {
      if (!target) return;
      let cancelled = false;
      profileApi
         .getProfile(target)
         .then(
            (d) => !cancelled && setLoaded({ key: target, data: d, error: null }),
         )
         .catch(
            (err) =>
               !cancelled &&
               setLoaded({
                  key: target,
                  data: null,
                  error:
                     err instanceof ApiError
                        ? err.message
                        : "Couldn't load this profile",
               }),
         );
      return () => {
         cancelled = true;
      };
   }, [target]);

   const current = loaded?.key === target ? loaded : null;
   const data = current?.data;
   const error = current?.error;

   const setActive = useCallback((isActive) => {
      setLoaded((l) =>
         l?.data
            ? {
                 ...l,
                 data: { ...l.data, account: { ...l.data.account, isActive } },
              }
            : l,
      );
   }, []);

   const user = data?.user;
   const isSelf = !!data?.isSelf;
   const isCoordinator = user?.role === "faculty";
   const isStudent = user?.role === "student";
   // A superAdmin runs the institute rather than taking part in it — no clubs, no
   // registrations — so their profile collapses to the About card alone.
   const isPlatformAdmin = user?.role === "superAdmin";

   async function share() {
      const url = `${window.location.origin}/u/${user.username || user.id}`;
      try {
         await navigator.clipboard.writeText(url);
         toast.success("Link copied to clipboard");
      } catch {
         toast.error("Couldn't copy link");
      }
   }

   if (error) {
      return (
         <AppShell title="Profile">
            <div className="main">
               <div className="profile-empty">
                  {error}
                  <div style={{ marginTop: 12 }}>
                     <Link to="/" className="fac-inline-link">
                        Back to dashboard
                     </Link>
                  </div>
               </div>
            </div>
         </AppShell>
      );
   }

   if (!user) {
      return (
         <AppShell title="Profile">
            <div className="main">
               <LoadingBlock label="Loading profile" size={28} />
            </div>
         </AppShell>
      );
   }

   // Second line under the name: faculty read as "Designation · Department",
   // students as "@handle · dept · year".
   const dept = user.profile?.department;
   const subline = isCoordinator
      ? [user.profile?.designation || "Faculty", dept].filter(Boolean).join(" · ")
      : [
           user.username ? `@${user.username}` : null,
           dept,
           user.profile?.year && YEAR_LABEL[user.profile.year],
        ]
           .filter(Boolean)
           .join(" · ");
   const chips = isCoordinator
      ? user.profile?.expertise || []
      : user.profile?.tags || [];
   const clubs = data.clubs || [];
   const events = data.events || [];
   const skills = user.skills || [];
   const interests = user.interests || [];
   const deactivated = data.account && data.account.isActive === false;
   // Faculty are framed around the clubs they run, so the panels count and link off
   // the coordinated set rather than every membership.
   const coordinated = clubs.filter((c) => c.role === "coordinator");
   const runsClubs = isCoordinator && coordinated.length > 0;
   const panelClubs = runsClubs ? coordinated : clubs;
   const [from, to] = coverFor(user.name || user.email || "");
   const firstName = (user.name || "").split(" ")[0];

   return (
      <AppShell title="Profile" subtitle={user.name}>
         <div className="main">
            <div className="profile-hero">
               <div
                  className="profile-cover"
                  style={{
                     background: `linear-gradient(135deg, ${from} 0%, ${to} 100%)`,
                  }}
               ></div>
               <div className="profile-info">
                  <div
                     className="profile-avatar"
                     style={{
                        background: `linear-gradient(135deg, ${from} 0%, ${to} 100%)`,
                     }}
                  >
                     {initials(user.name)}
                  </div>
                  <div className="profile-meta-block">
                     <div className="profile-name">
                        {user.name}
                        {user.emailVerified && (
                           <span className="verified-tick" title="Verified email">
                              <Icon size={12} strokeWidth={3}>
                                 <polyline points="20 6 9 17 4 12" />
                              </Icon>
                           </span>
                        )}
                        <span className="pr-role">
                           {ROLE_LABEL[user.role] || user.role}
                        </span>
                        {deactivated && (
                           <span className="pr-role off">Deactivated</span>
                        )}
                     </div>
                     <div className="profile-handle">
                        {subline || user.email}
                     </div>
                     {user.profile?.bio && (
                        <div className="profile-bio">{user.profile.bio}</div>
                     )}
                     <ProfileLinks profile={user.profile} />
                     {chips.length > 0 && (
                        <div className="profile-tags">
                           {chips.map((t) => (
                              <span key={t} className="profile-tag">
                                 {t}
                              </span>
                           ))}
                        </div>
                     )}
                  </div>
                  <div className="profile-actions">
                     <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={share}
                     >
                        Share profile
                     </button>
                  </div>
               </div>
            </div>

            {data.canManage && data.account && (
               <AdminControls
                  user={user}
                  account={data.account}
                  onChanged={setActive}
               />
            )}

               {!isPlatformAdmin && (
                  <div className="fac-stat-row pr-stats">
                     <StatCard
                        tone="purple"
                        label={isCoordinator ? "Clubs coordinated" : "Clubs"}
                        value={
                           isCoordinator
                              ? (data.stats?.coordinating ?? 0)
                              : (data.stats?.clubs ?? 0)
                        }
                     >
                        <Icon size={20} strokeWidth={2.2}>
                           <rect x="2" y="7" width="20" height="14" rx="2" />
                           <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                        </Icon>
                     </StatCard>

                     {/* Faculty are measured by what they run, students by what
                         they signed up for. */}
                     {isCoordinator && (
                        <>
                           <StatCard
                              tone="blue"
                              label="Members reached"
                              value={data.stats?.membersReached ?? 0}
                           >
                              <Icon size={20} strokeWidth={2.2}>
                                 <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                 <circle cx="9" cy="7" r="4" />
                                 <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                              </Icon>
                           </StatCard>
                           <StatCard
                              tone="orange"
                              label="Events hosted"
                              value={data.stats?.eventsHosted ?? 0}
                           >
                              <Icon size={20} strokeWidth={2.2}>
                                 <rect x="3" y="4" width="18" height="18" rx="2" />
                                 <line x1="16" y1="2" x2="16" y2="6" />
                                 <line x1="8" y1="2" x2="8" y2="6" />
                                 <line x1="3" y1="10" x2="21" y2="10" />
                              </Icon>
                           </StatCard>
                        </>
                     )}

                     {isStudent && (
                        <>
                           <StatCard
                              tone="blue"
                              label="Events registered"
                              value={data.stats?.eventsRegistered ?? 0}
                           >
                              <Icon size={20} strokeWidth={2.2}>
                                 <rect x="3" y="4" width="18" height="18" rx="2" />
                                 <line x1="16" y1="2" x2="16" y2="6" />
                                 <line x1="8" y1="2" x2="8" y2="6" />
                                 <line x1="3" y1="10" x2="21" y2="10" />
                              </Icon>
                           </StatCard>
                           <StatCard
                              tone="orange"
                              label="Coming up"
                              value={data.eventsPagination?.total ?? 0}
                           >
                              <Icon size={20} strokeWidth={2.2}>
                                 <circle cx="12" cy="12" r="10" />
                                 <polyline points="12 6 12 12 16 14" />
                              </Icon>
                           </StatCard>
                        </>
                     )}

                     <StatCard
                        tone="green"
                        label="Member since"
                        value={monthYear(user.createdAt)}
                     >
                        <Icon size={20} strokeWidth={2.2}>
                           <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                           <circle cx="12" cy="7" r="4" />
                        </Icon>
                     </StatCard>
                  </div>
               )}

               <div
                  className={`overview-grid${isPlatformAdmin ? " solo" : ""}`}
               >
                  {!isPlatformAdmin && (
                     <div>
                        <EventsPanel
                           key={target}
                           handle={target}
                           initial={{
                              items: events,
                              pagination: data.eventsPagination,
                           }}
                           sub={
                              isCoordinator
                                 ? isSelf
                                    ? "What your clubs are running next"
                                    : `Coming up from ${firstName}'s clubs`
                                 : isSelf
                                   ? "What you're signed up for next"
                                   : "Public events they're attending"
                           }
                           emptyText={
                              isCoordinator
                                 ? "No events scheduled yet."
                                 : "Nothing on the calendar yet."
                           }
                           cta={
                              isSelf && isCoordinator && coordinated[0] ? (
                                 <Link
                                    to={`/clubs/${coordinated[0].slug}/events/new`}
                                    className="fac-inline-link"
                                 >
                                    Create an event →
                                 </Link>
                              ) : isSelf && isStudent ? (
                                 <Link to="/explore" className="fac-inline-link">
                                    Explore events →
                                 </Link>
                              ) : null
                           }
                        />
                        <ClubsPanel
                           clubs={panelClubs}
                           title={runsClubs ? "Clubs coordinated" : "Clubs"}
                           sub={
                              runsClubs
                                 ? isSelf
                                    ? "Clubs you run"
                                    : `Clubs ${firstName} runs`
                                 : isSelf
                                   ? "Clubs you're part of"
                                   : `Clubs ${firstName} is part of`
                           }
                           emptyText={
                              isCoordinator
                                 ? "Not coordinating any club yet."
                                 : "Not a member of any club yet."
                           }
                           viewerRole={me?.role}
                        />
                     </div>
                  )}

                  <div>
                     <div className="panel">
                        <div className="panel-head">
                           <div>
                              <div className="panel-title">About</div>
                              {isPlatformAdmin && (
                                 <div className="panel-sub">
                                    Platform administrator — runs the institute
                                    rather than joining clubs.
                                 </div>
                              )}
                           </div>
                        </div>
                        <div className="pr-facts">
                           <Fact
                              label="Role"
                              value={ROLE_LABEL[user.role] || user.role}
                           />
                           <Fact
                              label="Email"
                              value={user.email}
                              href={`mailto:${user.email}`}
                           />
                           <Fact label="Department" value={dept} />
                           {isCoordinator ? (
                              <>
                                 <Fact
                                    label="Designation"
                                    value={user.profile?.designation}
                                 />
                                 <Fact
                                    label="Office"
                                    value={user.profile?.officeLocation}
                                 />
                              </>
                           ) : (
                              <Fact
                                 label="Year"
                                 value={
                                    user.profile?.year &&
                                    YEAR_LABEL[user.profile.year]
                                 }
                              />
                           )}
                           <Fact
                              label="Joined"
                              value={fullDate(user.createdAt)}
                           />
                        </div>
                        {isSelf && user.role !== "superAdmin" && (
                           <Link to="/settings" className="pr-edit-hint">
                              Edit these in Settings →
                           </Link>
                        )}
                     </div>

                     {!isCoordinator && skills.length > 0 && (
                        <div className="panel">
                           <div className="panel-head">
                              <div>
                                 <div className="panel-title">Skills</div>
                                 <div className="panel-sub">
                                    Self-reported proficiency
                                 </div>
                              </div>
                           </div>
                           {skills.map((s) => (
                              <div className="skill-row compact" key={s.name}>
                                 <div className="skill-name">{s.name}</div>
                                 <div className="skill-bar">
                                    <span
                                       style={{ width: `${s.level}%` }}
                                    ></span>
                                 </div>
                                 <div className="skill-level">
                                    {levelLabel(s.level)}
                                 </div>
                              </div>
                           ))}
                        </div>
                     )}

                     {interests.length > 0 && (
                        <div className="panel">
                           <div className="panel-head">
                              <div className="panel-title">Interests</div>
                           </div>
                           <div className="profile-tags">
                              {interests.map((t) => (
                                 <span key={t} className="profile-tag">
                                    {t}
                                 </span>
                              ))}
                           </div>
                        </div>
                     )}
                  </div>
               </div>
         </div>
      </AppShell>
   );
}
