import { useEffect, useState } from "react";
import { profileApi, ApiError } from "../services";
import AppShell from "../components/layout/AppShell";
import Icon from "../components/Icon";
import Spinner, { LoadingBlock } from "../components/Spinner";
import { useToast } from "../contexts/ToastContext";
import { useConfirm } from "../contexts/ConfirmContext";

const TABS = [
   { id: "overview", label: "Overview" },
   { id: "clubs", label: "Clubs" },
   { id: "achievements", label: "Achievements" },
   { id: "settings", label: "Settings" },
];

function initials(name = "") {
   const parts = name.trim().split(/\s+/);
   return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

function levelLabel(level) {
   if (level >= 75) return "Advanced";
   if (level >= 50) return "Intermediate";
   return "Beginner";
}

// Human-friendly relative time, e.g. "2 minutes ago", "yesterday".
function timeAgo(date) {
   const diff = (Date.now() - new Date(date).getTime()) / 1000;
   if (diff < 60) return "just now";
   if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
   if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
   if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
   return new Date(date).toLocaleDateString();
}

// Icon matching deviceType — phone for mobile, laptop for desktop.
function DeviceIcon({ type }) {
   if (type === "mobile" || type === "tablet") {
      return (
         <Icon size={18}>
            <rect x="5" y="2" width="14" height="20" rx="3" />
            <line x1="12" y1="18" x2="12.01" y2="18" />
         </Icon>
      );
   }
   return (
      <Icon size={18}>
         <rect x="2" y="3" width="20" height="14" rx="2" />
         <line x1="8" y1="21" x2="16" y2="21" />
         <line x1="12" y1="17" x2="12" y2="21" />
      </Icon>
   );
}

function ProfileLinks({ profile }) {
   const links = [
      profile?.linkedinUrl && { label: "LinkedIn", url: profile.linkedinUrl },
      profile?.githubUrl && { label: "GitHub", url: profile.githubUrl },
      profile?.portfolioUrl && { label: "Portfolio", url: profile.portfolioUrl },
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
               {label}
            </a>
         ))}
      </div>
   );
}

// ──────────────────────────────────────────────────────────────────────────────
// Hero — single source of truth for header data (user + completion).
// ──────────────────────────────────────────────────────────────────────────────
function Hero({ user, completion }) {
   const dept = user.profile?.department;
   const year = user.profile?.year;
   const handle = [
      user.username ? `@${user.username}` : null,
      dept,
      year && (year === "postgrad" ? "Postgrad" : `Year ${year}`),
   ]
      .filter(Boolean)
      .join(" · ");

   const toast = useToast();
   const shareUrl = `${window.location.origin}/u/${user.username || user._id || ""}`;

   const handleShare = async () => {
      try {
         await navigator.clipboard.writeText(shareUrl);
         toast.success("Link copied to clipboard");
      } catch {
         toast.error("Couldn't copy link");
      }
   };

   return (
      <div className="profile-hero">
         <div className="profile-cover"></div>
         <div className="profile-info">
            <div className="profile-avatar">{initials(user.name)}</div>
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
               </div>
               <div className="profile-handle">{handle || user.email}</div>
               {user.profile?.bio && (
                  <div className="profile-bio">{user.profile.bio}</div>
               )}
               <ProfileLinks profile={user.profile} />
               <div className="profile-tags">
                  <span className="profile-tag purple">
                     Profile {completion}% complete
                  </span>
                  {(user.profile?.tags || []).map((t) => (
                     <span key={t} className="profile-tag">
                        {t}
                     </span>
                  ))}
               </div>
            </div>
            <div className="profile-actions">
               <button className="btn btn-secondary" onClick={handleShare}>
                  Share profile
               </button>
            </div>
         </div>
      </div>
   );
}

// ──────────────────────────────────────────────────────────────────────────────
// Overview tab
// ──────────────────────────────────────────────────────────────────────────────
function OverviewTab() {
   const [stats, setStats] = useState(null);
   const [skills, setSkills] = useState(null);
   const [activity, setActivity] = useState(null);

   useEffect(() => {
      let cancelled = false;
      Promise.all([
         profileApi.getStats(),
         profileApi.getSkills(),
         profileApi.getRecentActivity(),
      ])
         .then(([s, sk, a]) => {
            if (cancelled) return;
            setStats(s?.stats || {});
            setSkills(sk?.skills || []);
            setActivity(a?.items || []);
         })
         .catch(() => {
            if (cancelled) return;
            // Failed fetch: render as empty rather than perpetual loading.
            setStats({});
            setSkills([]);
            setActivity([]);
         });
      return () => {
         cancelled = true;
      };
   }, []);

   const statsLoading = stats === null;

   return (
      <div className="tab-pane">
         <div className="stat-row">
            <StatCard
               label="Events attended"
               value={stats?.eventsAttended ?? 0}
               loading={statsLoading}
            />
            <StatCard
               label="Certificates"
               value={stats?.certificatesCount ?? 0}
               loading={statsLoading}
            />
            <StatCard
               label="Contest rating"
               value={stats?.contestRating ?? 0}
               loading={statsLoading}
            />
            <StatCard
               label="Streak"
               value={stats?.currentStreak ?? 0}
               unit="d"
               loading={statsLoading}
            />
         </div>

         <div className="overview-grid">
            <div>
               <div className="panel">
                  <div className="panel-head">
                     <div>
                        <div className="panel-title">Skill levels</div>
                        <div className="panel-sub">
                           Inferred from contest performance &amp; workshop
                           attendance
                        </div>
                     </div>
                  </div>
                  {skills === null ? (
                     <LoadingBlock label="Loading skills" />
                  ) : skills.length === 0 ? (
                     <div className="profile-empty">
                        No skills tracked yet — add some in Settings.
                     </div>
                  ) : (
                     skills.map((s) => (
                        <div className="skill-row" key={s.name}>
                           <div className="skill-name">{s.name}</div>
                           <div className="skill-bar">
                              <span style={{ width: `${s.level}%` }}></span>
                           </div>
                           <div className="skill-level">
                              {levelLabel(s.level)}
                           </div>
                        </div>
                     ))
                  )}
               </div>
            </div>
            <div>
               <div className="panel">
                  <div className="panel-head">
                     <div className="panel-title">Recent activity</div>
                  </div>
                  {activity === null ? (
                     <LoadingBlock label="Loading activity" />
                  ) : activity.length === 0 ? (
                     <div className="profile-empty">No recent activity.</div>
                  ) : (
                     activity.map((a, i) => (
                        <div className="activity-row" key={i}>
                           <div className="act-ico purple">
                              <Icon size={14}>
                                 <circle cx="12" cy="12" r="10" />
                              </Icon>
                           </div>
                           <div className="act-meta">
                              <div className="act-title">{a.title}</div>
                              <div className="act-time">{a.at}</div>
                           </div>
                        </div>
                     ))
                  )}
               </div>
            </div>
         </div>
      </div>
   );
}

function StatCard({ label, value, unit, loading }) {
   return (
      <div className="pstat">
         <div className="pstat-label">{label}</div>
         <div className="pstat-value">
            {loading ? (
               <span className="skeleton" style={{ width: 56, height: 24 }} />
            ) : (
               <>
                  {value}
                  {unit && <span className="pstat-unit">{unit}</span>}
               </>
            )}
         </div>
      </div>
   );
}

// ──────────────────────────────────────────────────────────────────────────────
// Clubs tab
// ──────────────────────────────────────────────────────────────────────────────
function ClubsTab() {
   const [clubs, setClubs] = useState(null);
   useEffect(() => {
      profileApi
         .getClubs()
         .then((d) => setClubs(d?.items || []))
         .catch(() => setClubs([]));
   }, []);

   if (clubs === null) return <LoadingBlock label="Loading clubs" />;
   if (clubs.length === 0)
      return (
         <div className="profile-empty">You haven't joined any clubs yet.</div>
      );

   return (
      <div className="member-grid">
         {clubs.map((c) => {
            const role = c.role || "member";
            return (
               <div className="member-card" key={c.clubId}>
                  <div className="member-avatar">
                     {(c.name || "?").slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                     <div className="member-name">{c.name}</div>
                     <div className="member-role">
                        {c.memberCount} members
                        {c.joinedAt
                           ? ` · joined ${new Date(c.joinedAt).toLocaleDateString()}`
                           : ""}
                     </div>
                  </div>
                  <span className={`role-tag ${role}`}>{role}</span>
               </div>
            );
         })}
      </div>
   );
}

// ──────────────────────────────────────────────────────────────────────────────
// Achievements tab — minimal summary; full list lives on /certificates.
// ──────────────────────────────────────────────────────────────────────────────
function AchievementsTab() {
   const [count, setCount] = useState(null);
   useEffect(() => {
      profileApi
         .getAchievementsSummary()
         .then((d) => setCount(d?.count ?? 0))
         .catch(() => setCount(0));
   }, []);

   if (count === null) return <LoadingBlock label="Loading achievements" size={28} />;

   return (
      <div className="achievements-empty">
         <div className="ic">
            <Icon size={28} strokeWidth={2.2}>
               <circle cx="12" cy="8" r="7" />
               <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
            </Icon>
         </div>
         <div className="count">{count} verified achievements</div>
         <div className="sub">
            All your certificates are downloadable from the Certificates page.
         </div>
      </div>
   );
}

// ──────────────────────────────────────────────────────────────────────────────
// Settings tab — its own internal section nav (account / notifications / …).
// ──────────────────────────────────────────────────────────────────────────────
const SECTIONS = [
   { id: "account", label: "Account" },
   { id: "notifications", label: "Notifications" },
   { id: "privacy", label: "Privacy & security" },
   { id: "sessions", label: "Sessions & devices" },
   { id: "danger", label: "Danger zone", danger: true },
];

function SettingsTab({ user, onUserUpdated }) {
   const [section, setSection] = useState("account");
   return (
      <div className="settings-layout">
         <div className="settings-nav">
            {SECTIONS.map((s) => (
               <button
                  key={s.id}
                  className={`${section === s.id ? "active" : ""} ${s.danger ? "danger" : ""}`}
                  onClick={() => setSection(s.id)}
               >
                  {s.label}
               </button>
            ))}
         </div>
         <div>
            {section === "account" && (
               <AccountForm user={user} onUserUpdated={onUserUpdated} />
            )}
            {section === "notifications" && (
               <PreferencesPanel kind="notifications" />
            )}
            {section === "privacy" && <PreferencesPanel kind="privacy" />}
            {section === "sessions" && <SessionsPanel />}
            {section === "danger" && <DangerZone />}
         </div>
      </div>
   );
}

// Comma-separated string ⇄ array, used for tags/interests inputs.
const fromCsv = (s) =>
   s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);

function AccountForm({ user, onUserUpdated }) {
   const [form, setForm] = useState({
      name: user.name || "",
      username: user.username || "",
      phone: user.phone || "",
      profile: {
         department: user.profile?.department || "",
         year: user.profile?.year || "",
         bio: user.profile?.bio || "",
         linkedinUrl: user.profile?.linkedinUrl || "",
         githubUrl: user.profile?.githubUrl || "",
         portfolioUrl: user.profile?.portfolioUrl || "",
      },
      tags: (user.profile?.tags || []).join(", "),
      interests: (user.interests || []).join(", "),
   });
   const [saving, setSaving] = useState(false);
   const toast = useToast();

   const setField = (path, value) => {
      setForm((f) => {
         if (path.startsWith("profile.")) {
            const key = path.slice("profile.".length);
            return { ...f, profile: { ...f.profile, [key]: value } };
         }
         return { ...f, [path]: value };
      });
   };

   const handleSave = async (e) => {
      e.preventDefault();
      setSaving(true);
      try {
         // Shape the payload to match the backend's strict() schema. Strip empty optionals so
         // Zod's url() validator doesn't reject "" — the backend already maps "" → undefined,
         // but only on fields it sees, so we omit them here for clarity.
         const profile = { ...form.profile, tags: fromCsv(form.tags) };
         for (const k of Object.keys(profile)) {
            if (profile[k] === "" || (Array.isArray(profile[k]) && profile[k].length === 0)) {
               delete profile[k];
            }
         }
         const payload = {
            name: form.name,
            ...(form.username ? { username: form.username } : {}),
            ...(form.phone ? { phone: form.phone } : {}),
            ...(Object.keys(profile).length ? { profile } : {}),
            interests: fromCsv(form.interests),
         };
         if (payload.interests.length === 0) delete payload.interests;

         const data = await profileApi.updateMe(payload);
         onUserUpdated?.(data);
         toast.success("Profile saved");
      } catch (err) {
         toast.error(err instanceof ApiError ? err.message : "Save failed");
      } finally {
         setSaving(false);
      }
   };

   return (
      <form className="panel" onSubmit={handleSave}>
         <div className="panel-head">
            <div>
               <div className="panel-title">Account</div>
               <div className="panel-sub">
                  Update your basic profile information
               </div>
            </div>
         </div>

         <div className="form-row">
            <div className="form-group">
               <label className="form-label">Display name</label>
               <input
                  className="input"
                  value={form.name}
                  onChange={(e) => setField("name", e.target.value)}
                  required
               />
            </div>
            <div className="form-group">
               <label className="form-label">Username</label>
               <input
                  className="input"
                  value={form.username}
                  onChange={(e) => setField("username", e.target.value)}
                  placeholder="lowercase, digits, . _ -"
               />
            </div>
         </div>

         <div className="form-row">
            <div className="form-group">
               <label className="form-label">Email</label>
               <input className="input" value={user.email} disabled readOnly />
               <div className="form-help">
                  {user.emailVerified
                     ? "Verified · institutional email"
                     : "Not yet verified"}
               </div>
            </div>
            <div className="form-group">
               <label className="form-label">Phone</label>
               <input
                  className="input"
                  value={form.phone}
                  onChange={(e) => setField("phone", e.target.value)}
                  placeholder="+91 …"
               />
            </div>
         </div>

         <div className="form-group">
            <label className="form-label">Bio</label>
            <textarea
               className="textarea"
               maxLength={280}
               value={form.profile.bio}
               onChange={(e) => setField("profile.bio", e.target.value)}
            />
            <div className="form-help">
               Visible on your public profile · max 280 characters
            </div>
         </div>

         <div className="form-row">
            <div className="form-group">
               <label className="form-label">Department</label>
               <input
                  className="input"
                  value={form.profile.department}
                  onChange={(e) =>
                     setField("profile.department", e.target.value)
                  }
               />
            </div>
            <div className="form-group">
               <label className="form-label">Year</label>
               <select
                  className="input"
                  value={form.profile.year}
                  onChange={(e) => setField("profile.year", e.target.value)}
               >
                  <option value="">—</option>
                  <option value="1">1st year</option>
                  <option value="2">2nd year</option>
                  <option value="3">3rd year</option>
                  <option value="4">Final year</option>
                  <option value="postgrad">Postgrad</option>
               </select>
            </div>
         </div>

         <div className="form-row">
            <div className="form-group">
               <label className="form-label">LinkedIn</label>
               <input
                  className="input"
                  type="url"
                  value={form.profile.linkedinUrl}
                  onChange={(e) =>
                     setField("profile.linkedinUrl", e.target.value)
                  }
                  placeholder="https://linkedin.com/in/…"
               />
            </div>
            <div className="form-group">
               <label className="form-label">GitHub</label>
               <input
                  className="input"
                  type="url"
                  value={form.profile.githubUrl}
                  onChange={(e) =>
                     setField("profile.githubUrl", e.target.value)
                  }
                  placeholder="https://github.com/…"
               />
            </div>
         </div>

         <div className="form-group">
            <label className="form-label">Portfolio</label>
            <input
               className="input"
               type="url"
               value={form.profile.portfolioUrl}
               onChange={(e) =>
                  setField("profile.portfolioUrl", e.target.value)
               }
               placeholder="https://…"
            />
         </div>

         <div className="form-row">
            <div className="form-group">
               <label className="form-label">Tags</label>
               <input
                  className="input"
                  value={form.tags}
                  onChange={(e) => setField("tags", e.target.value)}
                  placeholder="comma-separated"
               />
               <div className="form-help">Up to 10 · max 40 chars each</div>
            </div>
            <div className="form-group">
               <label className="form-label">Interests</label>
               <input
                  className="input"
                  value={form.interests}
                  onChange={(e) => setField("interests", e.target.value)}
                  placeholder="comma-separated"
               />
               <div className="form-help">Up to 30 · max 40 chars each</div>
            </div>
         </div>

         <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
               {saving && <Spinner size={14} />}
               {saving ? "Saving" : "Save changes"}
            </button>
         </div>
      </form>
   );
}

// Drives both Notifications and Privacy sections — both are just toggle groups on `preferences`.
const PREF_SECTIONS = {
   notifications: {
      title: "Notifications",
      sub: "Choose what we ping you about",
      toggles: [
         {
            key: "eventReminders",
            title: "Event reminders",
            sub: "Get pinged 24h, 1h before any event you registered for",
         },
         {
            key: "contestInvitations",
            title: "Contest invitations",
            sub: "Notify when a coding contest matching your skill drops",
         },
         {
            key: "clubAnnouncements",
            title: "Club announcements",
            sub: "From clubs you're a member of",
         },
         {
            key: "emailDigest",
            title: "Email digest",
            sub: "Weekly summary, every Sunday at 8pm",
         },
      ],
   },
   privacy: {
      title: "Privacy & visibility",
      sub: "Control who sees what",
      toggles: [
         {
            key: "publicProfile",
            title: "Public profile",
            sub: "Anyone with the link can view your profile",
         },
         {
            key: "showOnLeaderboards",
            title: "Show on leaderboards",
            sub: "Display your name & rank on contest leaderboards",
         },
      ],
   },
};

function PreferencesPanel({ kind }) {
   const meta = PREF_SECTIONS[kind];
   const [values, setValues] = useState(null);

   useEffect(() => {
      profileApi
         .getPreferences()
         .then((d) => setValues(d?.preferences?.[kind] || {}))
         .catch(() => setValues({}));
   }, [kind]);

   const toggle = async (key) => {
      const next = { ...values, [key]: !values[key] };
      setValues(next); // optimistic
      try {
         await profileApi.updatePreferences({ [kind]: { [key]: next[key] } });
      } catch {
         setValues(values); // rollback
      }
   };

   return (
      <div className="panel">
         <div className="panel-head">
            <div>
               <div className="panel-title">{meta.title}</div>
               <div className="panel-sub">{meta.sub}</div>
            </div>
         </div>
         {values === null ? (
            <LoadingBlock label="Loading preferences" />
         ) : (
            meta.toggles.map((t) => (
               <div className="toggle-row" key={t.key}>
                  <div className="toggle-meta">
                     <div className="toggle-title">{t.title}</div>
                     <div className="toggle-sub">{t.sub}</div>
                  </div>
                  <div
                     className={`toggle${values[t.key] ? " on" : ""}`}
                     onClick={() => toggle(t.key)}
                  ></div>
               </div>
            ))
         )}
      </div>
   );
}

function SessionsPanel() {
   const [sessions, setSessions] = useState(null);
   const [busy, setBusy] = useState(false);
   const [reloadTick, setReloadTick] = useState(0);
   const toast = useToast();
   const confirm = useConfirm();

   useEffect(() => {
      let cancelled = false;
      profileApi
         .getSessions()
         .then((d) => {
            if (!cancelled) setSessions(d?.items || []);
         })
         .catch(() => {
            if (!cancelled) setSessions([]);
         });
      return () => {
         cancelled = true;
      };
   }, [reloadTick]);

   const revoke = async (id) => {
      setBusy(true);
      try {
         await profileApi.revokeSession(id);
         setSessions((s) => s.filter((x) => x.id !== id));
         toast.success("Session revoked");
      } catch (err) {
         toast.error(err instanceof ApiError ? err.message : "Couldn't revoke session");
      } finally {
         setBusy(false);
      }
   };

   const revokeOthers = async () => {
      const ok = await confirm({
         title: "Sign out of all other sessions?",
         message: "Other devices will need to log in again.",
         confirmLabel: "Sign out others",
      });
      if (!ok) return;
      setBusy(true);
      try {
         await profileApi.revokeOtherSessions();
         setReloadTick((t) => t + 1);
         toast.success("Signed out of other sessions");
      } catch (err) {
         toast.error(err instanceof ApiError ? err.message : "Couldn't sign out other sessions");
      } finally {
         setBusy(false);
      }
   };

   return (
      <div className="panel">
         <div className="panel-head">
            <div>
               <div className="panel-title">Active sessions &amp; devices</div>
               <div className="panel-sub">
                  Places you're signed in. Revoke any you don't recognise.
               </div>
            </div>
            <button
               className="btn btn-secondary"
               onClick={revokeOthers}
               disabled={busy}
            >
               Sign out everywhere else
            </button>
         </div>

         {sessions === null ? (
            <LoadingBlock label="Loading sessions" />
         ) : sessions.length === 0 ? (
            <div className="profile-empty">No active sessions.</div>
         ) : (
            sessions.map((s) => (
               <div
                  key={s.id}
                  className={`sess-row${s.isCurrent ? " current" : ""}`}
               >
                  <div className="sess-ic">
                     <DeviceIcon type={s.deviceType} />
                  </div>
                  <div>
                     <div className="sess-title">
                        {[s.deviceLabel, s.browserLabel]
                           .filter(Boolean)
                           .join(" · ") || "Unknown device"}
                        {s.isCurrent && (
                           <span className="sess-now">● This device</span>
                        )}
                     </div>
                     <div className="sess-meta">
                        {[s.locationLabel, s.ip, timeAgo(s.lastActiveAt)]
                           .filter(Boolean)
                           .join(" · ")}
                     </div>
                  </div>
                  {!s.isCurrent && (
                     <button
                        className="sess-act danger"
                        disabled={busy}
                        onClick={() => revoke(s.id)}
                     >
                        Revoke
                     </button>
                  )}
               </div>
            ))
         )}

         <div className="sess-note">
            Sessions expire automatically after 30 days of inactivity. We'll
            email you if we detect a sign-in from a new location.
         </div>
      </div>
   );
}

function DangerZone() {
   const [busy, setBusy] = useState(false);
   const toast = useToast();
   const confirm = useConfirm();

   const handleDelete = async () => {
      const ok = await confirm({
         title: "Delete your account?",
         message: "This permanently erases your account and cannot be undone.",
         confirmLabel: "Delete account",
         danger: true,
      });
      if (!ok) return;
      setBusy(true);
      try {
         await profileApi.deleteAccount();
         toast.success("Account deleted");
         window.location.href = "/login";
      } catch (err) {
         toast.error(err instanceof ApiError ? err.message : "Couldn't delete account");
      } finally {
         setBusy(false);
      }
   };

   return (
      <div className="panel" style={{ padding: 12 }}>
         <div className="danger-zone">
            <div className="danger-row">
               <div>
                  <div className="meta-title">Delete account</div>
                  <div className="meta-sub">
                     Permanently remove your account and all data.
                  </div>
               </div>
               <button onClick={handleDelete} disabled={busy}>
                  Delete
               </button>
            </div>
         </div>
      </div>
   );
}

// ──────────────────────────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────────────────────────
export default function Profile() {
   const [tab, setTab] = useState("overview");
   const [user, setUser] = useState(null);
   const [completion, setCompletion] = useState(0);
   const [error, setError] = useState(null);

   useEffect(() => {
      profileApi
         .getMe()
         .then((d) => {
            setUser(d?.user || null);
            setCompletion(d?.completion ?? 0);
         })
         .catch((err) =>
            setError(err instanceof ApiError ? err.message : "Failed to load"),
         );
   }, []);

   const handleUserUpdated = (d) => {
      setUser(d?.user || user);
      setCompletion(d?.completion ?? completion);
   };

   return (
      <AppShell title="Profile & Settings">
         <div className="main">
            {error && <div className="auth-error">{error}</div>}
            {!user ? (
               <LoadingBlock label="Loading profile" size={28} />
            ) : (
               <>
                  <Hero user={user} completion={completion} />
                  <div className="profile-tabs">
                     {TABS.map((t) => (
                        <button
                           key={t.id}
                           className={`profile-tab${tab === t.id ? " active" : ""}`}
                           onClick={() => setTab(t.id)}
                        >
                           {t.label}
                        </button>
                     ))}
                  </div>
                  {tab === "overview" && <OverviewTab />}
                  {tab === "clubs" && <ClubsTab />}
                  {tab === "achievements" && <AchievementsTab />}
                  {tab === "settings" && (
                     <SettingsTab
                        user={user}
                        onUserUpdated={handleUserUpdated}
                     />
                  )}
               </>
            )}
         </div>
      </AppShell>
   );
}
