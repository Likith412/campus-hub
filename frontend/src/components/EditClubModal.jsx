// Edit-club modal — a club's coordinator (or superAdmin) edits its public profile.
// Self-contained: calls the API and then onChanged() so the caller can refetch.
// Kept as a standalone component for reuse on the future club-management surface.
import { useEffect, useState } from "react";
import { clubsApi, ApiError } from "../services";
import { useToast } from "../contexts/ToastContext";
import Icon from "./Icon";

function initials(name = "") {
   const parts = name.trim().split(/\s+/);
   return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

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
   { id: "social", label: "🤝 Social" },
   { id: "other", label: "✨ Other" },
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

export default function EditClubModal({ club, slug, onClose, onChanged }) {
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
