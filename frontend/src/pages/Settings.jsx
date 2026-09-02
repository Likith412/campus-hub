import { useEffect, useState } from "react";
import { Link } from "react-router";
import { profileApi, ApiError } from "../services";
import AppShell from "../components/layout/AppShell";
import Icon from "../components/Icon";
import Spinner, { LoadingBlock } from "../components/Spinner";
import { useToast } from "../contexts/ToastContext";
import { useConfirm } from "../contexts/ConfirmContext";

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

// ──────────────────────────────────────────────────────────────────────────────
// Section nav down the left of the page.
// ──────────────────────────────────────────────────────────────────────────────
const SECTIONS = [
   { id: "account", label: "Account" },
   { id: "notifications", label: "Notifications" },
   { id: "privacy", label: "Privacy & security" },
   { id: "sessions", label: "Sessions & devices" },
   { id: "danger", label: "Danger zone", danger: true },
];

// Comma-separated string ⇄ array, used for tags/interests inputs.
const fromCsv = (s) =>
   s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);

function AccountForm({ user, onUserUpdated, isCoordinator }) {
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
         designation: user.profile?.designation || "",
         officeLocation: user.profile?.officeLocation || "",
      },
      tags: (user.profile?.tags || []).join(", "),
      interests: (user.interests || []).join(", "),
      expertise: (user.profile?.expertise || []).join(", "),
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
         // Shape the payload to match the backend's strict() schema, scoped to the
         // fields that apply to this role. Empty optionals are stripped so Zod's
         // url() validator doesn't reject "".
         const p = form.profile;
         const profile = isCoordinator
            ? {
                 bio: p.bio,
                 department: p.department,
                 designation: p.designation,
                 officeLocation: p.officeLocation,
                 linkedinUrl: p.linkedinUrl,
                 portfolioUrl: p.portfolioUrl,
                 expertise: fromCsv(form.expertise),
              }
            : {
                 bio: p.bio,
                 department: p.department,
                 year: p.year,
                 linkedinUrl: p.linkedinUrl,
                 githubUrl: p.githubUrl,
                 portfolioUrl: p.portfolioUrl,
                 tags: fromCsv(form.tags),
              };
         for (const k of Object.keys(profile)) {
            if (
               profile[k] === "" ||
               (Array.isArray(profile[k]) && profile[k].length === 0)
            ) {
               delete profile[k];
            }
         }
         const payload = {
            name: form.name,
            ...(form.username ? { username: form.username } : {}),
            ...(form.phone ? { phone: form.phone } : {}),
            ...(Object.keys(profile).length ? { profile } : {}),
            ...(isCoordinator ? {} : { interests: fromCsv(form.interests) }),
         };
         if (payload.interests && payload.interests.length === 0)
            delete payload.interests;

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
                  {isCoordinator
                     ? "Your faculty profile, shown to members of clubs you coordinate"
                     : "Update your basic profile information"}
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

         {isCoordinator ? (
            <>
               <div className="form-row">
                  <div className="form-group">
                     <label className="form-label">Designation</label>
                     <input
                        className="input"
                        value={form.profile.designation}
                        onChange={(e) =>
                           setField("profile.designation", e.target.value)
                        }
                        placeholder="e.g. Assistant Professor"
                     />
                  </div>
                  <div className="form-group">
                     <label className="form-label">Department</label>
                     <input
                        className="input"
                        value={form.profile.department}
                        onChange={(e) =>
                           setField("profile.department", e.target.value)
                        }
                        placeholder="e.g. Computer Science"
                     />
                  </div>
               </div>

               <div className="form-group">
                  <label className="form-label">Office location</label>
                  <input
                     className="input"
                     value={form.profile.officeLocation}
                     onChange={(e) =>
                        setField("profile.officeLocation", e.target.value)
                     }
                     placeholder="e.g. Block C, Cabin 214"
                  />
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
                     <label className="form-label">Website</label>
                     <input
                        className="input"
                        type="url"
                        value={form.profile.portfolioUrl}
                        onChange={(e) =>
                           setField("profile.portfolioUrl", e.target.value)
                        }
                        placeholder="https://… (faculty page, scholar, etc.)"
                     />
                  </div>
               </div>

               <div className="form-group">
                  <label className="form-label">Areas of expertise</label>
                  <input
                     className="input"
                     value={form.expertise}
                     onChange={(e) => setField("expertise", e.target.value)}
                     placeholder="comma-separated · e.g. Machine Learning, Robotics"
                  />
                  <div className="form-help">
                     Up to 12 · shown as tags on your profile
                  </div>
               </div>
            </>
         ) : (
            <>
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
                        onChange={(e) =>
                           setField("profile.year", e.target.value)
                        }
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
                     <div className="form-help">
                        Up to 10 · max 40 chars each
                     </div>
                  </div>
                  <div className="form-group">
                     <label className="form-label">Interests</label>
                     <input
                        className="input"
                        value={form.interests}
                        onChange={(e) => setField("interests", e.target.value)}
                        placeholder="comma-separated"
                     />
                     <div className="form-help">
                        Up to 30 · max 40 chars each
                     </div>
                  </div>
               </div>
            </>
         )}

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
            studentOnly: true,
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
            studentOnly: true,
         },
      ],
   },
};

function PreferencesPanel({ kind, isCoordinator }) {
   const meta = PREF_SECTIONS[kind];
   const toggles = meta.toggles.filter(
      (t) => !(isCoordinator && t.studentOnly),
   );
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
            toggles.map((t) => (
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
         toast.error(
            err instanceof ApiError ? err.message : "Couldn't revoke session",
         );
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
         toast.error(
            err instanceof ApiError
               ? err.message
               : "Couldn't sign out other sessions",
         );
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
         toast.error(
            err instanceof ApiError ? err.message : "Couldn't delete account",
         );
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
// Page — account settings only. The profile itself lives at /profile.
// ──────────────────────────────────────────────────────────────────────────────
export default function Settings() {
   const [section, setSection] = useState("account");
   const [user, setUser] = useState(null);
   const [error, setError] = useState(null);

   useEffect(() => {
      profileApi
         .getMe()
         .then((d) => setUser(d?.user || null))
         .catch((err) =>
            setError(err instanceof ApiError ? err.message : "Failed to load"),
         );
   }, []);

   const isCoordinator = user?.role === "faculty";

   return (
      <AppShell title="Settings">
         <div className="main">
            <div className="fac-pagehead">
               <h1 className="fac-page-title">Settings</h1>
               <p className="fac-page-sub">
                  Your account details, what we notify you about, and the devices
                  you're signed in on.{" "}
                  <Link to="/profile" className="fac-inline-link">
                     View your profile
                  </Link>
               </p>
            </div>

            {error && <div className="auth-error">{error}</div>}
            {!user ? (
               <LoadingBlock label="Loading settings" size={28} />
            ) : (
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
                        <AccountForm
                           user={user}
                           onUserUpdated={(d) => setUser(d?.user || user)}
                           isCoordinator={isCoordinator}
                        />
                     )}
                     {section === "notifications" && (
                        <PreferencesPanel
                           kind="notifications"
                           isCoordinator={isCoordinator}
                        />
                     )}
                     {section === "privacy" && (
                        <PreferencesPanel
                           kind="privacy"
                           isCoordinator={isCoordinator}
                        />
                     )}
                     {section === "sessions" && <SessionsPanel />}
                     {section === "danger" && <DangerZone />}
                  </div>
               </div>
            )}
         </div>
      </AppShell>
   );
}
