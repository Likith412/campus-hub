import { useEffect, useState } from "react";
import { Link } from "react-router";
import { profileApi, errMessage, fieldErrors } from "../services";
import AppShell from "../components/layout/AppShell";
import Icon from "../components/Icon";
import Spinner, { LoadingBlock } from "../components/Spinner";
import { postedAt } from "../utils/text";
import { useAuth } from "../contexts/AuthContext";

// Session ages read in the compact style, with the plain locale date past a week.
const sessionAge = (d) => postedAt(d, (x) => new Date(x).toLocaleDateString());
import { useToast } from "../contexts/ToastContext";
import { useConfirm } from "../contexts/ConfirmContext";


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
   // Students only — a coordinator profile has no skills block.
   { id: "skills", label: "Skills", studentOnly: true },
   { id: "password", label: "Password" },
   { id: "sessions", label: "Sessions & devices" },
   { id: "danger", label: "Danger zone", danger: true },
];

function levelLabel(level) {
   if (level >= 75) return "Advanced";
   if (level >= 50) return "Intermediate";
   return "Beginner";
}

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
   // Per-field reasons from the last failed save, cleared as soon as a field is edited.
   const [errors, setErrors] = useState({});
   const toast = useToast();

   const setField = (path, value) => {
      setErrors((e) => (e[path] ? { ...e, [path]: undefined } : e));
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
         // Emptied fields go through as "" / [] — that's how they get cleared. Only
         // username is held back, since the API has no way to unset one.
         const payload = {
            name: form.name,
            phone: form.phone,
            profile,
            ...(form.username ? { username: form.username } : {}),
            ...(isCoordinator ? {} : { interests: fromCsv(form.interests) }),
         };

         setErrors({});
         const data = await profileApi.updateMe(payload);
         onUserUpdated?.(data);
         toast.success("Profile saved");
      } catch (err) {
         setErrors(fieldErrors(err));
         toast.error(errMessage(err, "Save failed"));
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
               {errors.name && (
                  <div className="form-help error">{errors.name}</div>
               )}
            </div>
            <div className="form-group">
               <label className="form-label">Username</label>
               <input
                  className="input"
                  value={form.username}
                  onChange={(e) =>
                     setField("username", e.target.value.toLowerCase())
                  }
                  placeholder="lowercase, digits, . _ -"
               />
               {errors.username && (
                  <div className="form-help error">{errors.username}</div>
               )}
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
               {errors.phone && (
                  <div className="form-help error">{errors.phone}</div>
               )}
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
            errMessage(err, "Couldn't revoke session"),
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
            errMessage(err, "Couldn't sign out other sessions"),
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
                        {[s.locationLabel, s.ip, sessionAge(s.lastActiveAt)]
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
            Sessions expire automatically after 30 days of inactivity. Revoke
            anything you don't recognise.
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
            errMessage(err, "Couldn't delete account"),
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


// Skills the profile page renders. PUT replaces the whole list, so the editor keeps the
// full array in state and sends it back on save.
function SkillsPanel() {
   const [skills, setSkills] = useState(null);
   const [saving, setSaving] = useState(false);
   const toast = useToast();

   useEffect(() => {
      let cancelled = false;
      profileApi
         .getSkills()
         .then((d) => !cancelled && setSkills(d?.skills || []))
         .catch(() => !cancelled && setSkills([]));
      return () => {
         cancelled = true;
      };
   }, []);

   const setRow = (i, patch) =>
      setSkills((rows) =>
         rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
      );

   const save = async (e) => {
      e.preventDefault();
      // The API rejects a blank name, and a blank row just means "I changed my mind".
      const payload = skills
         .map((r) => ({ name: r.name.trim(), level: Number(r.level) || 0 }))
         .filter((r) => r.name);
      // The profile lists each skill once; the API refuses duplicates too.
      const seen = new Set(payload.map((r) => r.name.toLowerCase()));
      if (seen.size !== payload.length) {
         toast.error("Each skill can only be listed once");
         return;
      }
      setSaving(true);
      try {
         const d = await profileApi.updateSkills(payload);
         setSkills(d?.skills || payload);
         toast.success("Skills updated");
      } catch (err) {
         toast.error(
            errMessage(err, "Couldn't save skills"),
         );
      } finally {
         setSaving(false);
      }
   };

   if (!skills) return <LoadingBlock label="Loading skills" size={26} />;

   return (
      <form className="panel" onSubmit={save}>
         <div className="panel-head">
            <div>
               <div className="panel-title">Skills</div>
               <div className="panel-sub">
                  Self-reported proficiency, shown on your public profile
               </div>
            </div>
         </div>

         {skills.length === 0 ? (
            <div className="form-help">
               Nothing here yet — add a skill to show it on your profile.
            </div>
         ) : (
            <div className="skill-edit-list">
               {skills.map((sk, i) => (
                  <div className="skill-edit-row" key={i}>
                     <input
                        className="input"
                        value={sk.name}
                        maxLength={60}
                        placeholder="e.g. React"
                        onChange={(e) => setRow(i, { name: e.target.value })}
                     />
                     <input
                        className="skill-range"
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={sk.level ?? 0}
                        aria-label={`${sk.name || "Skill"} level`}
                        onChange={(e) =>
                           setRow(i, { level: Number(e.target.value) })
                        }
                     />
                     <span className="skill-level">
                        {levelLabel(sk.level ?? 0)}
                     </span>
                     <button
                        type="button"
                        className="skill-remove"
                        title="Remove skill"
                        aria-label={`Remove ${sk.name || "skill"}`}
                        onClick={() =>
                           setSkills((rows) => rows.filter((_, idx) => idx !== i))
                        }
                     >
                        <Icon size={15} strokeWidth={2.2}>
                           <line x1="18" y1="6" x2="6" y2="18" />
                           <line x1="6" y1="6" x2="18" y2="18" />
                        </Icon>
                     </button>
                  </div>
               ))}
            </div>
         )}

         <div className="form-actions">
            <button
               type="button"
               className="btn btn-secondary"
               disabled={skills.length >= 50}
               onClick={() =>
                  setSkills((rows) => [...rows, { name: "", level: 50 }])
               }
            >
               Add skill
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
               {saving && <Spinner size={14} />}
               {saving ? "Saving" : "Save skills"}
            </button>
         </div>
      </form>
   );
}

// Authenticated password change. The server keeps this session and revokes every other.
function PasswordPanel() {
   const [form, setForm] = useState({
      currentPassword: "",
      newPassword: "",
      confirm: "",
   });
   const [saving, setSaving] = useState(false);
   const [errors, setErrors] = useState({});
   const toast = useToast();

   const setField = (k, v) => {
      setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));
      setForm((f) => ({ ...f, [k]: v }));
   };
   const mismatch = !!form.confirm && form.newPassword !== form.confirm;

   const submit = async (e) => {
      e.preventDefault();
      if (mismatch) return;
      setSaving(true);
      try {
         await profileApi.changePassword({
            currentPassword: form.currentPassword,
            newPassword: form.newPassword,
         });
         setForm({ currentPassword: "", newPassword: "", confirm: "" });
         setErrors({});
         toast.success("Password changed — other devices were signed out");
      } catch (err) {
         setErrors(fieldErrors(err));
         toast.error(errMessage(err, "Couldn't change password"));
      } finally {
         setSaving(false);
      }
   };

   return (
      <form className="panel" onSubmit={submit}>
         <div className="panel-head">
            <div>
               <div className="panel-title">Password</div>
               <div className="panel-sub">
                  Changing it signs you out everywhere else
               </div>
            </div>
         </div>

         <div className="form-group">
            <label className="form-label">Current password</label>
            <input
               className="input"
               type="password"
               autoComplete="current-password"
               value={form.currentPassword}
               onChange={(e) => setField("currentPassword", e.target.value)}
               required
            />
            {errors.currentPassword && (
               <div className="form-help error">{errors.currentPassword}</div>
            )}
         </div>

         <div className="form-row">
            <div className="form-group">
               <label className="form-label">New password</label>
               <input
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={form.newPassword}
                  onChange={(e) => setField("newPassword", e.target.value)}
                  required
               />
               <div className={`form-help${errors.newPassword ? " error" : ""}`}>
                  {errors.newPassword ||
                     "At least 8 characters, with an uppercase letter, a lowercase letter and a number."}
               </div>
            </div>
            <div className="form-group">
               <label className="form-label">Confirm new password</label>
               <input
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={form.confirm}
                  onChange={(e) => setField("confirm", e.target.value)}
                  required
               />
               {mismatch && (
                  <div className="form-help error">
                     Those two don't match.
                  </div>
               )}
            </div>
         </div>

         <div className="form-actions">
            <button
               type="submit"
               className="btn btn-primary"
               disabled={saving || mismatch}
            >
               {saving && <Spinner size={14} />}
               {saving ? "Saving" : "Change password"}
            </button>
         </div>
      </form>
   );
}

// ──────────────────────────────────────────────────────────────────────────────
// Page — account settings only. The profile itself lives at /profile.
// ──────────────────────────────────────────────────────────────────────────────
export default function Settings() {
   const { refreshUser } = useAuth();
   const [section, setSection] = useState("account");
   const [user, setUser] = useState(null);
   const [error, setError] = useState(null);

   useEffect(() => {
      profileApi
         .getMe()
         .then((d) => setUser(d?.user || null))
         .catch((err) =>
            setError(errMessage(err, "Failed to load")),
         );
   }, []);

   const isCoordinator = user?.role === "faculty";

   return (
      <AppShell title="Settings">
         <div className="main">
            <div className="fac-pagehead">
               <h1 className="fac-page-title">Settings</h1>
               <p className="fac-page-sub">
                  Your account details and the devices you're signed in on.{" "}
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
                     {SECTIONS.filter(
                        (s) => !s.studentOnly || !isCoordinator,
                     ).map((s) => (
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
                           onUserUpdated={(d) => {
                              const next = d?.user || user;
                              setUser(next);
                              refreshUser(next);
                           }}
                           isCoordinator={isCoordinator}
                        />
                     )}
                     {section === "skills" && !isCoordinator && <SkillsPanel />}
                     {section === "password" && <PasswordPanel />}
                     {section === "sessions" && <SessionsPanel />}
                     {section === "danger" && <DangerZone />}
                  </div>
               </div>
            )}
         </div>
      </AppShell>
   );
}
