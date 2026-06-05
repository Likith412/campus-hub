import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { clubsApi, adminApi, ApiError } from "../services";
import { useAuth } from "../contexts/AuthContext";
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

function MemberRow({ row, canManage, canManageRole, busy, onChangeRole, onRemove }) {
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

   // Demote a coordinator → member (superAdmin only). Removing here is members-only —
   // coordinators are stepped down via the superAdmin "Manage faculty" flow.
   const canDemote = canManageRole && row.role !== "member";
   const canRemove = canManage && row.role !== "coordinator";
   const hasActions = canDemote || canRemove;

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
         {hasActions ? (
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
                     {/* Demoting a coordinator → member is superAdmin-only (backend enforces it too). */}
                     {canDemote && (
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
                     {/* Members only — coordinators are stepped down via Manage faculty. */}
                     {canRemove && (
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
                     )}
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

// Mirror the Create-club wizard's field options so editing feels identical.
const PALETTE = [
   { from: "#6c63ff", to: "#34d399" },
   { from: "#3b82f6", to: "#60a5fa" },
   { from: "#f59e0b", to: "#fcd34d" },
   { from: "#ef4444", to: "#fca5a5" },
   { from: "#a855f7", to: "#d8b4fe" },
   { from: "#ec4899", to: "#f9a8d4" },
   { from: "#06b6d4", to: "#67e8f9" },
   { from: "#64748b", to: "#94a3b8" },
];
const DOMAINS = [
   { id: "tech", label: "💻 Tech & CS" },
   { id: "design", label: "🎨 Design" },
   { id: "culture", label: "🎭 Culture" },
   { id: "sports", label: "⚽ Sports" },
   { id: "business", label: "📈 Business" },
   { id: "media", label: "📷 Media" },
];
const POLICIES = [
   {
      id: "open",
      apiValue: "open",
      name: "Open",
      desc: "Anyone joins instantly",
      icon: (
         <>
            <path d="M18 8A6 6 0 0 0 6 8" />
            <rect x="3" y="11" width="18" height="11" rx="2" />
         </>
      ),
   },
   {
      id: "request",
      apiValue: "request",
      name: "Request",
      desc: "You approve each member",
      icon: (
         <>
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
         </>
      ),
   },
   {
      id: "invite",
      apiValue: "invite-only",
      name: "Invite-only",
      desc: "Members added by you",
      icon: (
         <>
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <line x1="19" y1="8" x2="19" y2="14" />
            <line x1="22" y1="11" x2="16" y2="11" />
         </>
      ),
   },
];

// Coordinator/superAdmin: edit the club's public profile. Self-contained — calls the API,
// then onChanged() so the parent refetches.
function EditClubModal({ club, slug, onClose, onChanged }) {
   const toast = useToast();
   const [name, setName] = useState(club.name || "");
   const [domain, setDomain] = useState(club.category || "");
   const [tagline, setTagline] = useState(club.tagline || "");
   const [foundedYear, setFoundedYear] = useState(club.foundedYear || "");
   const [desc, setDesc] = useState(club.description || "");
   const [tags, setTags] = useState(club.tags || []);
   const [tagDraft, setTagDraft] = useState("");
   const [policy, setPolicy] = useState(
      POLICIES.find((p) => p.apiValue === club.joinPolicy)?.id || "request",
   );
   const [isPrivate, setIsPrivate] = useState(!!club.isPrivate);
   const [links, setLinks] = useState({
      website: club.socialLinks?.website || "",
      instagram: club.socialLinks?.instagram || "",
      linkedin: club.socialLinks?.linkedin || "",
   });
   // Highlight the matching palette swatch; keep the club's custom colours until one is picked.
   const [colorIdx, setColorIdx] = useState(
      PALETTE.findIndex(
         (p) => p.from.toLowerCase() === (club.coverFrom || "").toLowerCase(),
      ),
   );
   const [busy, setBusy] = useState(false);

   const color =
      colorIdx >= 0
         ? PALETTE[colorIdx]
         : {
              from: club.coverFrom || PALETTE[0].from,
              to: club.coverTo || PALETTE[0].to,
           };
   const gradient = `linear-gradient(135deg, ${color.from}, ${color.to})`;
   const mono = initials(name);
   const policyObj = POLICIES.find((p) => p.id === policy) || POLICIES[1];

   useEffect(() => {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      const onKey = (e) => {
         if (e.key === "Escape" && !busy) onClose();
      };
      window.addEventListener("keydown", onKey);
      return () => {
         document.body.style.overflow = prev;
         window.removeEventListener("keydown", onKey);
      };
   }, [busy, onClose]);

   function addTag() {
      const t = tagDraft.trim().slice(0, 40);
      if (t && tags.length < 10 && !tags.includes(t)) setTags([...tags, t]);
      setTagDraft("");
   }

   async function save() {
      const payload = {
         name: name.trim(),
         category: domain,
         tagline: tagline.trim(),
         description: desc.trim(),
         tags,
         settings: { joinPolicy: policyObj.apiValue, isPrivate },
         socialLinks: {
            website: links.website.trim(),
            instagram: links.instagram.trim(),
            linkedin: links.linkedin.trim(),
         },
         coverFrom: color.from,
         coverTo: color.to,
      };
      if (foundedYear) payload.foundedYear = Number(foundedYear);
      setBusy(true);
      try {
         await clubsApi.updateClub(slug, payload);
         toast.success("Club updated");
         onChanged();
         onClose();
      } catch (err) {
         toast.error(
            err instanceof ApiError ? err.message : "Couldn't update club",
         );
      } finally {
         setBusy(false);
      }
   }

   return (
      <div className="fac-overlay" onClick={() => !busy && onClose()}>
         <div
            className="fac-modal wide"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
         >
            <div className="fac-modal-head">
               <div className="fac-modal-title">Edit club</div>
               <div className="fac-modal-sub">
                  Update your club's public profile.
               </div>
            </div>
            <div className="fac-modal-body ec-body">
               <div className="create-club">
                  <div className="field">
                     <label className="label">
                        Club name <span className="req">*</span>
                     </label>
                     <input
                        className="input"
                        value={name}
                        onChange={(e) => setName(e.target.value.slice(0, 80))}
                        maxLength={80}
                     />
                  </div>

                  <div className="field">
                     <label className="label">Logo &amp; colour</label>
                     <div className="identity-row">
                        <div
                           className="logo-preview"
                           style={{ background: gradient }}
                        >
                           {club.logoUrl ? (
                              <img
                                 src={club.logoUrl}
                                 alt=""
                                 style={{
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "cover",
                                    borderRadius: 18,
                                 }}
                              />
                           ) : (
                              mono
                           )}
                        </div>
                        <div className="identity-controls">
                           <div
                              className="help"
                              style={{ marginTop: 0, marginBottom: 8 }}
                           >
                              Pick a cover colour:
                           </div>
                           <div className="swatch-row">
                              {PALETTE.map((p, i) => (
                                 <div
                                    key={p.from}
                                    className={`swatch${i === colorIdx ? " active" : ""}`}
                                    style={{
                                       background: `linear-gradient(135deg, ${p.from}, ${p.to})`,
                                    }}
                                    onClick={() => setColorIdx(i)}
                                 />
                              ))}
                           </div>
                        </div>
                     </div>
                  </div>

                  <div className="field">
                     <label className="label">
                        Domain <span className="req">*</span>
                     </label>
                     <div className="chip-grid">
                        {DOMAINS.map((d) => (
                           <span
                              key={d.id}
                              className={`chip${domain === d.id ? " active" : ""}`}
                              onClick={() => setDomain(d.id)}
                           >
                              {d.label}
                           </span>
                        ))}
                     </div>
                  </div>

                  <div className="field">
                     <label className="label">
                        Tagline <span className="req">*</span>
                     </label>
                     <input
                        className="input"
                        value={tagline}
                        onChange={(e) => setTagline(e.target.value.slice(0, 90))}
                        maxLength={90}
                        placeholder="One line that captures what you do"
                     />
                  </div>

                  <div className="field">
                     <label className="label">
                        Founded year <span className="opt">· optional</span>
                     </label>
                     <input
                        className="input"
                        type="number"
                        inputMode="numeric"
                        value={foundedYear}
                        min={1900}
                        max={new Date().getFullYear()}
                        onChange={(e) => setFoundedYear(e.target.value)}
                        placeholder="e.g. 2019"
                     />
                  </div>

                  <div className="field">
                     <label className="label">
                        Description <span className="opt">· optional</span>
                     </label>
                     <textarea
                        className="textarea"
                        value={desc}
                        onChange={(e) => setDesc(e.target.value.slice(0, 500))}
                        maxLength={500}
                        placeholder="What does the club do? Who is it for?"
                     />
                  </div>

                  <div className="field">
                     <label className="label">
                        Topic tags <span className="opt">· up to 10</span>
                     </label>
                     <div className="tag-box">
                        {tags.map((t, i) => (
                           <span key={t} className="tag">
                              {t}
                              <span
                                 className="x"
                                 onClick={() =>
                                    setTags(tags.filter((_, j) => j !== i))
                                 }
                              >
                                 <Icon size={9} strokeWidth={3}>
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                 </Icon>
                              </span>
                           </span>
                        ))}
                        <input
                           value={tagDraft}
                           onChange={(e) =>
                              setTagDraft(e.target.value.slice(0, 40))
                           }
                           maxLength={40}
                           onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === ",") {
                                 e.preventDefault();
                                 addTag();
                              } else if (
                                 e.key === "Backspace" &&
                                 !tagDraft &&
                                 tags.length
                              ) {
                                 setTags(tags.slice(0, -1));
                              }
                           }}
                           placeholder="Type a tag and press Enter…"
                        />
                     </div>
                  </div>

                  <div className="field">
                     <label className="label">
                        Social links <span className="opt">· optional</span>
                     </label>
                     <input
                        className="input"
                        type="url"
                        value={links.website}
                        onChange={(e) =>
                           setLinks({ ...links, website: e.target.value })
                        }
                        placeholder="Website — https://…"
                        style={{ marginBottom: 8 }}
                     />
                     <input
                        className="input"
                        type="url"
                        value={links.instagram}
                        onChange={(e) =>
                           setLinks({ ...links, instagram: e.target.value })
                        }
                        placeholder="Instagram — https://instagram.com/…"
                        style={{ marginBottom: 8 }}
                     />
                     <input
                        className="input"
                        type="url"
                        value={links.linkedin}
                        onChange={(e) =>
                           setLinks({ ...links, linkedin: e.target.value })
                        }
                        placeholder="LinkedIn — https://linkedin.com/…"
                     />
                  </div>

                  <div className="field">
                     <label className="label">Join policy</label>
                     <div className="policy-grid">
                        {POLICIES.map((p) => (
                           <div
                              key={p.id}
                              className={`policy-card${policy === p.id ? " active" : ""}`}
                              onClick={() => setPolicy(p.id)}
                           >
                              <div className="pc-ic">
                                 <Icon size={15} strokeWidth={2.2}>
                                    {p.icon}
                                 </Icon>
                              </div>
                              <div className="pc-name">{p.name}</div>
                              <div className="pc-desc">{p.desc}</div>
                           </div>
                        ))}
                     </div>
                  </div>

                  <div className="field">
                     <label className="label">Visibility</label>
                     <button
                        type="button"
                        className={`cc-private${isPrivate ? " on" : ""}`}
                        onClick={() => setIsPrivate((v) => !v)}
                     >
                        <span className="cc-private-meta">
                           <span className="cc-private-name">Private club</span>
                           <span className="cc-private-sub">
                              Hidden from public browse — only invited or approved
                              members can find it.
                           </span>
                        </span>
                        <span className="cc-switch" />
                     </button>
                  </div>
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
               <button
                  type="button"
                  className="btn btn-primary"
                  onClick={save}
                  disabled={busy}
               >
                  {busy ? "Saving…" : "Save changes"}
               </button>
            </div>
         </div>
      </div>
   );
}

// superAdmin: list current coordinators, add another faculty, or step one down.
function ManageFacultyModal({ slug, onClose, onChanged }) {
   const toast = useToast();
   const confirm = useConfirm();
   const [coords, setCoords] = useState(null);
   const [q, setQ] = useState("");
   const [results, setResults] = useState([]);
   const [searching, setSearching] = useState(false);
   const [busyId, setBusyId] = useState(null);

   const loadCoords = useCallback(() => {
      clubsApi
         .listMembers(slug, {
            role: "coordinator",
            status: "approved",
            limit: 50,
         })
         .then((d) => setCoords(d.items || []))
         .catch(() => setCoords([]));
   }, [slug]);

   useEffect(() => {
      loadCoords();
   }, [loadCoords]);

   useEffect(() => {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      const onKey = (e) => {
         if (e.key === "Escape") onClose();
      };
      window.addEventListener("keydown", onKey);
      return () => {
         document.body.style.overflow = prev;
         window.removeEventListener("keydown", onKey);
      };
   }, [onClose]);

   // Debounced search of platform coordinators. State is set inside the timer/promise
   // (not synchronously in the effect body); stale results are hidden by the `q` guard below.
   useEffect(() => {
      const term = q.trim();
      if (!term) return;
      let active = true;
      const id = setTimeout(() => {
         setSearching(true);
         adminApi
            .listUsers({ role: "coordinator", q: term, status: "active", limit: 8 })
            .then((d) => active && setResults(d.items || []))
            .catch(() => active && setResults([]))
            .finally(() => active && setSearching(false));
      }, 300);
      return () => {
         active = false;
         clearTimeout(id);
      };
   }, [q]);

   const coordIds = new Set((coords || []).map((c) => String(c.userId)));
   const candidates = results.filter((u) => !coordIds.has(String(u.id)));

   async function add(u) {
      setBusyId(u.id);
      try {
         await clubsApi.addCoordinator(slug, u.id);
         toast.success(`${u.name} added as coordinator`);
         setQ("");
         setResults([]);
         loadCoords();
         onChanged();
      } catch (err) {
         toast.error(
            err instanceof ApiError ? err.message : "Couldn't add coordinator",
         );
      } finally {
         setBusyId(null);
      }
   }

   async function remove(c) {
      const ok = await confirm({
         title: `Step ${c.name} down?`,
         message: "They'll become a regular member of this club.",
         confirmLabel: "Step down",
         danger: true,
      });
      if (!ok) return;
      setBusyId(c.userId);
      try {
         await clubsApi.removeCoordinator(slug, c.userId);
         toast.success(`${c.name} stepped down`);
         loadCoords();
         onChanged();
      } catch (err) {
         toast.error(
            err instanceof ApiError ? err.message : "Couldn't remove coordinator",
         );
      } finally {
         setBusyId(null);
      }
   }

   return (
      <div className="fac-overlay" onClick={onClose}>
         <div
            className="fac-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
         >
            <div className="fac-modal-head">
               <div className="fac-modal-title">Manage faculty</div>
               <div className="fac-modal-sub">
                  Assign or step down the coordinators who run this club.
               </div>
            </div>
            <div className="fac-modal-body">
               <div className="fac-modal-field">
                  <label className="fac-modal-label">Add a coordinator</label>
                  <input
                     className="fac-modal-input"
                     value={q}
                     onChange={(e) => setQ(e.target.value)}
                     placeholder="Search faculty by name or email…"
                  />
                  {q.trim() && (
                     <div className="mf-results">
                        {searching ? (
                           <div className="mf-empty">Searching…</div>
                        ) : candidates.length === 0 ? (
                           <div className="mf-empty">No matching faculty</div>
                        ) : (
                           candidates.map((u) => (
                              <button
                                 key={u.id}
                                 type="button"
                                 className="mf-result"
                                 disabled={busyId === u.id}
                                 onClick={() => add(u)}
                              >
                                 <div>
                                    <div className="mf-name">{u.name}</div>
                                    <div className="mf-sub">{u.email}</div>
                                 </div>
                                 <span className="mf-add">
                                    {busyId === u.id ? "…" : "+ Add"}
                                 </span>
                              </button>
                           ))
                        )}
                     </div>
                  )}
               </div>

               <div className="fac-modal-label" style={{ marginTop: 4 }}>
                  Current coordinators
               </div>
               <div className="mf-list">
                  {coords === null ? (
                     <div className="mf-empty">Loading…</div>
                  ) : coords.length === 0 ? (
                     <div className="mf-empty">No coordinators yet</div>
                  ) : (
                     coords.map((c) => (
                        <div key={c.userId} className="mf-row">
                           <div className="avatar sm">{initials(c.name)}</div>
                           <div className="mf-rowtext">
                              <div className="mf-name">{c.name}</div>
                              <div className="mf-sub">
                                 {c.department || "Faculty"}
                              </div>
                           </div>
                           <button
                              type="button"
                              className="mf-remove"
                              disabled={busyId === c.userId || coords.length <= 1}
                              title={
                                 coords.length <= 1
                                    ? "A club needs at least one coordinator"
                                    : "Step down to member"
                              }
                              onClick={() => remove(c)}
                           >
                              {busyId === c.userId ? "…" : "Remove"}
                           </button>
                        </div>
                     ))
                  )}
               </div>
            </div>
            <div className="fac-modal-foot">
               <button type="button" className="btn btn-secondary" onClick={onClose}>
                  Done
               </button>
            </div>
         </div>
      </div>
   );
}

export default function ClubDetail() {
   const { slug } = useParams();
   const toast = useToast();
   const confirm = useConfirm();
   const { user } = useAuth();
   const isSuperAdmin = user?.role === "superAdmin";
   const isStudent = user?.role === "student";
   const [club, setClub] = useState(null);
   const [clubLoadedSlug, setClubLoadedSlug] = useState(null);
   const [joinBusy, setJoinBusy] = useState(false);
   const [verifyBusy, setVerifyBusy] = useState(false);
   const [statusBusy, setStatusBusy] = useState(false);
   const [editOpen, setEditOpen] = useState(false);
   const [facultyOpen, setFacultyOpen] = useState(false);
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

   async function handleToggleVerify() {
      if (!club) return;
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
      setVerifyBusy(true);
      try {
         await clubsApi.setVerification(slug, next);
         setClub((c) => (c ? { ...c, verified: next } : c));
         toast.success(next ? "Club verified" : "Verification removed");
      } catch (err) {
         toast.error(
            err instanceof ApiError ? err.message : "Couldn't update verification",
         );
      } finally {
         setVerifyBusy(false);
      }
   }

   // superAdmin: suspend / archive / reactivate the club.
   async function handleSetStatus(next) {
      if (!club || next === club.status) return;
      const verb = { active: "Reactivate", suspended: "Suspend", archived: "Archive" };
      const ok = await confirm({
         title: `${verb[next]} ${club.name}?`,
         message:
            next === "active"
               ? "The club becomes publicly visible and joinable again."
               : next === "suspended"
                 ? "The club is hidden from browse and joining is blocked until you reactivate it."
                 : "The club is archived and hidden from browse. You can reactivate it later.",
         confirmLabel: verb[next],
         danger: next !== "active",
      });
      if (!ok) return;
      setStatusBusy(true);
      try {
         await clubsApi.setStatus(slug, next);
         setClub((c) => (c ? { ...c, status: next } : c));
         toast.success(
            next === "active" ? "Club reactivated" : `Club ${next}`,
         );
      } catch (err) {
         toast.error(
            err instanceof ApiError ? err.message : "Couldn't update status",
         );
      } finally {
         setStatusBusy(false);
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
         await clubsApi.setMemberRole(slug, row.userId, role);
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
         await clubsApi.setMemberStatus(slug, row.userId, "approved");
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
         await clubsApi.setMemberStatus(slug, row.userId, "rejected");
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
   // A coordinator of this club can't leave it (only a superAdmin can step them down).
   const isCoordinatorHere =
      club.membership?.role === "coordinator" &&
      club.membership?.status === "approved";
   // Only students join clubs. Students who are approved members see "Leave"; coordinators
   // don't get a Leave CTA; everyone else gets no join CTA.
   const showJoinButton =
      !isCoordinatorHere && (isStudent || joinKind === "leave");

   // Can edit the club if superAdmin, or an approved coordinator of this club.
   const canManageClub = isSuperAdmin || isCoordinatorHere;

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
                  <div className="club-name">
                     {club.name}
                     {club.verified ? (
                        <span className="verified-tick" title="Verified by institute">
                           <Icon size={10} strokeWidth={4}>
                              <polyline points="20 6 9 17 4 12" />
                           </Icon>
                        </span>
                     ) : (
                        <span className="unverified-pill" title="Not yet verified">
                           Unverified
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
                  {canManageClub && (
                     <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setEditOpen(true)}
                     >
                        Edit club
                     </button>
                  )}
                  {isSuperAdmin && (
                     <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setFacultyOpen(true)}
                     >
                        Manage faculty
                     </button>
                  )}
                  {isSuperAdmin && (
                     <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={verifyBusy}
                        onClick={handleToggleVerify}
                     >
                        {verifyBusy
                           ? "…"
                           : club.verified
                             ? "Unverify"
                             : "Verify ✓"}
                     </button>
                  )}
                  {isSuperAdmin && (
                     <select
                        className="club-status-select"
                        value={club.status || "active"}
                        disabled={statusBusy}
                        onChange={(e) => handleSetStatus(e.target.value)}
                        aria-label="Club status"
                     >
                        <option value="active">Active</option>
                        <option value="suspended">Suspended</option>
                        <option value="archived">Archived</option>
                     </select>
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
                                 canManageRole={isSuperAdmin}
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

         {editOpen && (
            <EditClubModal
               club={club}
               slug={slug}
               onClose={() => setEditOpen(false)}
               onChanged={refetchClub}
            />
         )}
         {facultyOpen && (
            <ManageFacultyModal
               slug={slug}
               onClose={() => setFacultyOpen(false)}
               onChanged={() => {
                  refetchClub();
                  fetchMembers();
               }}
            />
         )}
      </AppShell>
   );
}
