import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { clubsApi, adminApi, ApiError } from "../services";
import AppShell from "../components/layout/AppShell";
import Icon from "../components/Icon";
import { useAuth } from "../contexts/AuthContext";
import { useActiveClub } from "../contexts/ActiveClubContext";
import { useToast } from "../contexts/ToastContext";

// Monogram colour palette (each = a cover gradient).
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
const DOMAIN_LABEL = Object.fromEntries(DOMAINS.map((d) => [d.id, d.label]));
// Plain category labels (no emoji) — mirror the Clubs page card's domain-tag.
const DOMAIN_TAG = {
   tech: "Tech & CS",
   design: "Design",
   culture: "Culture",
   sports: "Sports",
   business: "Business",
   media: "Media",
   social: "Social",
   other: "Other",
};
// Join-button label the real card shows for a non-member viewer.
const JOIN_PREVIEW = {
   open: "Join",
   request: "Request to join",
   "invite-only": "Invite-only",
};

const POLICIES = [
   {
      id: "open",
      apiValue: "open",
      name: "Open",
      desc: "Anyone joins instantly",
      preview: "🟢 Open join",
      label: "Open join",
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
      preview: "🟠 Approval needed",
      label: "Approval needed",
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
      preview: "⚪ Invite-only",
      label: "Invite-only",
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

const STEPS = ["Identity", "Details", "Membership", "Review & create"];
const STOPWORDS = /^(the|of|and|society|club|group)$/i;

function initials(name) {
   const cleaned = (name || "").trim();
   if (!cleaned) return "QC";
   return (
      cleaned
         .split(/\s+/)
         .filter((w) => !STOPWORDS.test(w))
         .map((w) => w[0])
         .slice(0, 2)
         .join("")
         .toUpperCase() || cleaned.slice(0, 2).toUpperCase()
   );
}
function slugify(s = "") {
   return s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
}

export default function CreateClub() {
   const navigate = useNavigate();
   const toast = useToast();
   const { user } = useAuth();
   const { refresh: refreshActiveClub } = useActiveClub();
   const isSuperAdmin = user?.role === "superAdmin";

   // SuperAdmin assigns coordinators; faculty self-assign on create.
   const [faculty, setFaculty] = useState([]);
   const [facultyQuery, setFacultyQuery] = useState("");
   const [coordinators, setCoordinators] = useState([]); // [{ id, name, email }]

   useEffect(() => {
      if (!isSuperAdmin) return;
      adminApi
         .listUsers({ role: "coordinator", status: "active", limit: 50 })
         .then((d) => setFaculty(d?.items || []))
         .catch(() => setFaculty([]));
   }, [isSuperAdmin]);

   const [step, setStep] = useState(1);
   const [creating, setCreating] = useState(false);
   const [created, setCreated] = useState(null);

   // Lock body scroll while the success modal is open (mirrors ConfirmModal).
   useEffect(() => {
      if (!created) return;
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
         document.body.style.overflow = prev;
      };
   }, [created]);

   const [name, setName] = useState("");
   const [slug, setSlug] = useState("");
   const [slugTouched, setSlugTouched] = useState(false);
   const [colorIdx, setColorIdx] = useState(0);
   const [domain, setDomain] = useState("");
   const [tagline, setTagline] = useState("");
   const [foundedYear, setFoundedYear] = useState("");
   const [desc, setDesc] = useState("");
   const [tags, setTags] = useState([]);
   const [tagDraft, setTagDraft] = useState("");
   const [policy, setPolicy] = useState("open");
   const [isPrivate, setIsPrivate] = useState(false);
   const [links, setLinks] = useState({
      website: "",
      instagram: "",
      linkedin: "",
   });

   const color = PALETTE[colorIdx];
   const gradient = `linear-gradient(135deg, ${color.from}, ${color.to})`;
   const mono = initials(name);
   const policyObj = useMemo(
      () => POLICIES.find((p) => p.id === policy),
      [policy],
   );

   const onName = (v) => {
      setName(v.slice(0, 80));
      if (!slugTouched) setSlug(slugify(v));
   };
   const onSlug = (v) => {
      setSlugTouched(true);
      setSlug(slugify(v));
   };
   const addTag = () => {
      const t = tagDraft.trim().slice(0, 40);
      if (t && tags.length < 10 && !tags.includes(t)) setTags([...tags, t]);
      setTagDraft("");
   };

   const isCoordSelected = (id) => coordinators.some((c) => c.id === id);
   const toggleCoordinator = (f) =>
      setCoordinators((prev) =>
         prev.some((c) => c.id === f.id)
            ? prev.filter((c) => c.id !== f.id)
            : [...prev, { id: f.id, name: f.name, email: f.email }],
      );
   const filteredFaculty = faculty.filter((f) => {
      const q = facultyQuery.trim().toLowerCase();
      return (
         !q ||
         f.name.toLowerCase().includes(q) ||
         f.email.toLowerCase().includes(q)
      );
   });

   function validate(n) {
      if (n === 1 && name.trim().length < 3) {
         toast.error("Enter a club name (3+ chars)");
         return false;
      }
      if (n === 1 && slug.trim() && slug.trim().length < 3) {
         toast.error("Slug must be 3+ characters (or leave it blank)");
         return false;
      }
      if (n === 2 && !domain) {
         toast.error("Pick a domain");
         return false;
      }
      if (n === 2 && !tagline.trim()) {
         toast.error("Add a tagline");
         return false;
      }
      if (n === 3 && isSuperAdmin && coordinators.length === 0) {
         toast.error("Assign at least one coordinator");
         return false;
      }
      return true;
   }

   function goTo(n) {
      if (n < 1 || n > 4) return;
      if (n > step && !validate(step)) return;
      setStep(n);
   }

   async function publish() {
      if (!validate(1) || !validate(2) || !validate(3)) return;
      setCreating(true);
      try {
         // Only send links the user actually filled.
         const socialLinks = Object.fromEntries(
            Object.entries(links)
               .map(([k, v]) => [k, v.trim()])
               .filter(([, v]) => v),
         );
         const res = await clubsApi.createClub({
            name: name.trim(),
            slug: slug.trim() || undefined,
            category: domain,
            tagline: tagline.trim(),
            foundedYear: foundedYear ? Number(foundedYear) : undefined,
            description: desc.trim() || undefined,
            tags,
            joinPolicy: policyObj.apiValue,
            isPrivate,
            ...(Object.keys(socialLinks).length ? { socialLinks } : {}),
            ...(isSuperAdmin
               ? { coordinatorIds: coordinators.map((c) => c.id) }
               : {}),
            coverFrom: color.from,
            coverTo: color.to,
         });
         setCreated(res);
         // Surface the new club in the faculty switcher and focus it (no-op for superAdmin).
         if (!isSuperAdmin) refreshActiveClub(res.slug);
      } catch (err) {
         toast.error(
            err instanceof ApiError ? err.message : "Couldn't create club",
         );
         setCreating(false);
      }
   }

   function reset() {
      setCreated(null);
      setCreating(false);
      setStep(1);
      setName("");
      setSlug("");
      setSlugTouched(false);
      setColorIdx(0);
      setDomain("");
      setTagline("");
      setFoundedYear("");
      setDesc("");
      setTags([]);
      setPolicy("open");
      setIsPrivate(false);
      setLinks({ website: "", instagram: "", linkedin: "" });
      setCoordinators([]);
      setFacultyQuery("");
   }

   return (
      <AppShell title="Create a Club">
         <div className="create-club">
            <div className="wizard">
               <div className="wizard-head">
                  <div className="breadcrumb">
                     {isSuperAdmin ? (
                        <Link to="/admin/clubs">Clubs</Link>
                     ) : (
                        <span>Clubs</span>
                     )}
                     <span className="sep">›</span>
                     <span className="now">Create a club</span>
                  </div>
                  <div className="wizard-title">Create a new club</div>
                  <div className="wizard-sub">
                     {isSuperAdmin
                        ? "Your club goes live and verified ✓ immediately so you can start adding members and events."
                        : "Your club goes live immediately so you can start adding members and events. A Super Admin awards the verified ✓ once it's reviewed — usually within a day."}
                  </div>
               </div>

               {/* STEPPER */}
               <div className="stepper">
                  {STEPS.map((label, i) => {
                     const n = i + 1;
                     return (
                        <div key={label} style={{ display: "contents" }}>
                           {i > 0 && (
                              <div
                                 className={`step-line${n <= step ? " done" : ""}`}
                              />
                           )}
                           <div
                              className={`step${n === step ? " active" : ""}${n < step ? " complete" : ""}`}
                              onClick={() => goTo(n)}
                           >
                              <div className="step-num">
                                 {n < step ? (
                                    <Icon size={13} strokeWidth={3}>
                                       <polyline points="20 6 9 17 4 12" />
                                    </Icon>
                                 ) : (
                                    n
                                 )}
                              </div>
                              <div className="step-meta">
                                 <div className="step-label">Step {n}</div>
                                 <div className="step-name">{label}</div>
                              </div>
                           </div>
                        </div>
                     );
                  })}
               </div>

               <div className="wizard-grid">
                  <div className="panel">
                     {step === 1 && (
                        <div className="step-pane active">
                           <div className="panel-h2">Name &amp; branding</div>
                           <div className="panel-sub">
                              This is how students will find and recognise your
                              club.
                           </div>

                           <div className="field">
                              <label className="label">
                                 Club name <span className="req">*</span>
                              </label>
                              <input
                                 className="input"
                                 value={name}
                                 onChange={(e) => onName(e.target.value)}
                                 placeholder="e.g. Quantum Computing Society"
                                 maxLength={80}
                                 autoFocus
                              />
                              <div className="help">
                                 <span className="ct">{name.length}</span>/80 ·
                                 keep it short and recognisable
                              </div>
                           </div>

                           <div className="field">
                              <label className="label">
                                 URL slug
                                 <span className="opt">· auto-generated</span>
                              </label>
                              <div className="input-affix">
                                 <span className="prefix">campushub.edu/c/</span>
                                 <input
                                    className="input"
                                    value={slug}
                                    onChange={(e) => onSlug(e.target.value)}
                                    placeholder="quantum-computing"
                                    maxLength={60}
                                 />
                              </div>
                              <div className="help">
                                 Used in the club's public link. Lowercase
                                 letters, numbers and hyphens. If this one's
                                 taken, we'll add a number to make it unique.
                              </div>
                           </div>

                           <div className="field">
                              <label className="label">Logo &amp; colour</label>
                              <div className="identity-row">
                                 <div
                                    className="logo-preview"
                                    style={{ background: gradient }}
                                 >
                                    {mono}
                                 </div>
                                 <div className="identity-controls">
                                    <div
                                       className="help"
                                       style={{ marginTop: 0, marginBottom: 8 }}
                                    >
                                       We auto-generate a monogram from the
                                       name. Pick a colour:
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
                        </div>
                     )}

                     {step === 2 && (
                        <div className="step-pane active">
                           <div className="panel-h2">What's it about?</div>
                           <div className="panel-sub">
                              Help students decide if this is for them.
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
                                 onChange={(e) =>
                                    setTagline(e.target.value.slice(0, 90))
                                 }
                                 placeholder="One line that captures what you do"
                                 maxLength={90}
                              />
                              <div className="help">
                                 <span className="ct">{tagline.length}</span>/90
                                 · shown on the club card
                              </div>
                           </div>

                           <div className="field">
                              <label className="label">
                                 Founded year{" "}
                                 <span className="opt">· optional</span>
                              </label>
                              <input
                                 className="input"
                                 type="number"
                                 inputMode="numeric"
                                 value={foundedYear}
                                 min={1900}
                                 max={new Date().getFullYear()}
                                 onChange={(e) =>
                                    setFoundedYear(e.target.value)
                                 }
                                 placeholder="e.g. 2019"
                              />
                              <div className="help">
                                 Shown as “Est. {foundedYear || "2019"}” on the
                                 club card.
                              </div>
                           </div>

                           <div className="field">
                              <label className="label">
                                 Description{" "}
                                 <span className="opt">· optional</span>
                              </label>
                              <textarea
                                 className="textarea"
                                 value={desc}
                                 onChange={(e) =>
                                    setDesc(e.target.value.slice(0, 500))
                                 }
                                 placeholder="What does the club do? Who is it for? What can members expect?"
                                 maxLength={500}
                              />
                              <div className="help">
                                 <span className="ct">{desc.length}</span>/500
                              </div>
                           </div>

                           <div className="field">
                              <label className="label">
                                 Topic tags{" "}
                                 <span className="opt">· up to 10</span>
                              </label>
                              <div className="tag-box">
                                 {tags.map((t, i) => (
                                    <span key={t} className="tag">
                                       {t}
                                       <span
                                          className="x"
                                          onClick={() =>
                                             setTags(
                                                tags.filter((_, j) => j !== i),
                                             )
                                          }
                                       >
                                          <Icon size={9} strokeWidth={3}>
                                             <line
                                                x1="18"
                                                y1="6"
                                                x2="6"
                                                y2="18"
                                             />
                                             <line
                                                x1="6"
                                                y1="6"
                                                x2="18"
                                                y2="18"
                                             />
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
                              <div className="help">
                                 Students filter and search by these.
                              </div>
                           </div>

                           <div className="field">
                              <label className="label">
                                 Social links{" "}
                                 <span className="opt">· optional</span>
                              </label>
                              <input
                                 className="input"
                                 type="url"
                                 value={links.website}
                                 onChange={(e) =>
                                    setLinks({
                                       ...links,
                                       website: e.target.value,
                                    })
                                 }
                                 placeholder="Website — https://…"
                                 style={{ marginBottom: 8 }}
                              />
                              <input
                                 className="input"
                                 type="url"
                                 value={links.instagram}
                                 onChange={(e) =>
                                    setLinks({
                                       ...links,
                                       instagram: e.target.value,
                                    })
                                 }
                                 placeholder="Instagram — https://instagram.com/…"
                                 style={{ marginBottom: 8 }}
                              />
                              <input
                                 className="input"
                                 type="url"
                                 value={links.linkedin}
                                 onChange={(e) =>
                                    setLinks({
                                       ...links,
                                       linkedin: e.target.value,
                                    })
                                 }
                                 placeholder="LinkedIn — https://linkedin.com/…"
                              />
                           </div>
                        </div>
                     )}

                     {step === 3 && (
                        <div className="step-pane active">
                           <div className="panel-h2">
                              Who runs &amp; joins it?
                           </div>
                           <div className="panel-sub">
                              {isSuperAdmin ? (
                                 "Assign the faculty who will coordinate this club."
                              ) : (
                                 <>
                                    You're set as the <b>coordinator</b>{" "}
                                    automatically.
                                 </>
                              )}
                           </div>

                           {isSuperAdmin && (
                              <div className="field">
                                 <label className="label">
                                    Assign coordinators{" "}
                                    <span className="req">*</span>
                                 </label>
                                 {coordinators.length > 0 && (
                                    <div className="cc-coord-chips">
                                       {coordinators.map((c) => (
                                          <span key={c.id} className="tag">
                                             {c.name}
                                             <span
                                                className="x"
                                                onClick={() =>
                                                   toggleCoordinator(c)
                                                }
                                             >
                                                <Icon size={9} strokeWidth={3}>
                                                   <line
                                                      x1="18"
                                                      y1="6"
                                                      x2="6"
                                                      y2="18"
                                                   />
                                                   <line
                                                      x1="6"
                                                      y1="6"
                                                      x2="18"
                                                      y2="18"
                                                   />
                                                </Icon>
                                             </span>
                                          </span>
                                       ))}
                                    </div>
                                 )}
                                 <input
                                    className="input"
                                    value={facultyQuery}
                                    onChange={(e) =>
                                       setFacultyQuery(e.target.value)
                                    }
                                    placeholder="Search active faculty…"
                                    style={{ marginBottom: 8 }}
                                 />
                                 <div className="cc-faculty-list">
                                    {filteredFaculty.length === 0 ? (
                                       <div className="cc-faculty-empty">
                                          No active faculty found.
                                       </div>
                                    ) : (
                                       filteredFaculty.map((f) => (
                                          <button
                                             type="button"
                                             key={f.id}
                                             className={`cc-faculty-item${isCoordSelected(f.id) ? " active" : ""}`}
                                             onClick={() =>
                                                toggleCoordinator(f)
                                             }
                                          >
                                             <span className="cc-faculty-meta">
                                                <span className="cc-faculty-name">
                                                   {f.name}
                                                </span>
                                                <span className="cc-faculty-email">
                                                   {f.email}
                                                </span>
                                             </span>
                                             {isCoordSelected(f.id) && (
                                                <Icon size={14} strokeWidth={3}>
                                                   <polyline points="20 6 9 17 4 12" />
                                                </Icon>
                                             )}
                                          </button>
                                       ))
                                    )}
                                 </div>
                                 <div className="help">
                                    Each becomes an approved coordinator. Only
                                    active faculty can be assigned.
                                 </div>
                              </div>
                           )}

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
                                    <span className="cc-private-name">
                                       Private club
                                    </span>
                                    <span className="cc-private-sub">
                                       Hidden from public browse — only invited
                                       or approved members can find it.
                                    </span>
                                 </span>
                                 <span className="cc-switch" />
                              </button>
                           </div>
                        </div>
                     )}

                     {step === 4 && (
                        <div className="step-pane active">
                           <div className="panel-h2">Review &amp; create</div>
                           <div className="panel-sub">
                              Last look before your club goes live. You can edit
                              everything later from club settings.
                           </div>

                           <div className="summary">
                              <div className="summary-row">
                                 <div className="summary-label">Club</div>
                                 <div className="summary-val">
                                    <strong>
                                       {name.trim() || "Untitled club"}
                                    </strong>
                                    <br />
                                    <span className="meta">
                                       campushub.edu/c/{slug || "—"}
                                    </span>
                                 </div>
                                 <button
                                    className="edit-link"
                                    onClick={() => setStep(1)}
                                 >
                                    Edit
                                 </button>
                              </div>
                              <div className="summary-row">
                                 <div className="summary-label">Domain</div>
                                 <div className="summary-val">
                                    {DOMAIN_LABEL[domain] || "Not set"}
                                 </div>
                                 <button
                                    className="edit-link"
                                    onClick={() => setStep(2)}
                                 >
                                    Edit
                                 </button>
                              </div>
                              <div className="summary-row">
                                 <div className="summary-label">Tagline</div>
                                 <div className="summary-val">
                                    {tagline.trim() || "Not set"}
                                 </div>
                                 <button
                                    className="edit-link"
                                    onClick={() => setStep(2)}
                                 >
                                    Edit
                                 </button>
                              </div>
                              <div className="summary-row">
                                 <div className="summary-label">Founded</div>
                                 <div className="summary-val">
                                    {foundedYear || "Not set"}
                                 </div>
                                 <button
                                    className="edit-link"
                                    onClick={() => setStep(2)}
                                 >
                                    Edit
                                 </button>
                              </div>
                              <div className="summary-row">
                                 <div className="summary-label">Tags</div>
                                 <div className="summary-val">
                                    {tags.length ? (
                                       <div className="tagrow">
                                          {tags.map((t) => (
                                             <span key={t}>{t}</span>
                                          ))}
                                       </div>
                                    ) : (
                                       <span
                                          style={{
                                             color: "var(--text-tertiary)",
                                          }}
                                       >
                                          No tags added
                                       </span>
                                    )}
                                 </div>
                                 <button
                                    className="edit-link"
                                    onClick={() => setStep(2)}
                                 >
                                    Edit
                                 </button>
                              </div>
                              <div className="summary-row">
                                 <div className="summary-label">Membership</div>
                                 <div className="summary-val">
                                    {policyObj.label}
                                    {!isSuperAdmin && (
                                       <>
                                          <br />
                                          <span className="meta">
                                             You · coordinator
                                          </span>
                                       </>
                                    )}
                                 </div>
                                 <button
                                    className="edit-link"
                                    onClick={() => setStep(3)}
                                 >
                                    Edit
                                 </button>
                              </div>
                              {isSuperAdmin && (
                                 <div className="summary-row">
                                    <div className="summary-label">
                                       Coordinators
                                    </div>
                                    <div className="summary-val">
                                       {coordinators.length
                                          ? coordinators
                                               .map((c) => c.name)
                                               .join(", ")
                                          : "None assigned"}
                                    </div>
                                    <button
                                       className="edit-link"
                                       onClick={() => setStep(3)}
                                    >
                                       Edit
                                    </button>
                                 </div>
                              )}
                              <div className="summary-row">
                                 <div className="summary-label">Visibility</div>
                                 <div className="summary-val">
                                    {isPrivate ? "Private" : "Public"}
                                 </div>
                                 <button
                                    className="edit-link"
                                    onClick={() => setStep(3)}
                                 >
                                    Edit
                                 </button>
                              </div>
                           </div>

                           <div className="review-note">
                              <div className="ic">
                                 <Icon size={15} strokeWidth={2.4}>
                                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                                 </Icon>
                              </div>
                              <div>
                                 <h4>
                                    {isSuperAdmin
                                       ? "Goes live verified ✓"
                                       : "Goes live unverified"}
                                 </h4>
                                 <p>
                                    {isSuperAdmin
                                       ? "Your club is active and verified the moment you create it — verified clubs rank higher in Explore."
                                       : "Your club is active the moment you create it. A Super Admin reviews new clubs and awards the verified ✓ — verified clubs rank higher in Explore."}
                                 </p>
                              </div>
                           </div>
                        </div>
                     )}
                  </div>

                  {/* RIGHT: live preview + info */}
                  <div className="side">
                     <div className="preview-label">
                        Live preview
                        <span className="preview-pill">
                           Updates as you type
                        </span>
                     </div>
                     {/* Mirror the Clubs page ClubCard markup so the preview matches 1:1. */}
                     <div className="club-card" style={{ cursor: "default" }}>
                        <div
                           className="club-cover"
                           style={{ background: gradient }}
                        >
                           <div className="cover-bg" />
                           <span className="domain-tag">
                              {DOMAIN_TAG[domain] || "Domain"}
                           </span>
                           {isPrivate && (
                              <span
                                 className="private-tag"
                                 title="Private club"
                              >
                                 <Icon size={9} strokeWidth={2.5}>
                                    <rect
                                       x="3"
                                       y="11"
                                       width="18"
                                       height="11"
                                       rx="2"
                                    />
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                 </Icon>
                                 Private
                              </span>
                           )}
                           <div
                              className="club-logo-lg"
                              style={{ background: gradient }}
                           >
                              {mono}
                           </div>
                        </div>
                        <div className="club-body">
                           <div className="club-head-row">
                              <div className="club-name">
                                 {name.trim() || "Your club name"}
                              </div>
                              {isSuperAdmin && (
                                 <span
                                    className="verified-tick"
                                    title="Verified by institute"
                                 >
                                    <Icon size={9} strokeWidth={4}>
                                       <polyline points="20 6 9 17 4 12" />
                                    </Icon>
                                 </span>
                              )}
                           </div>
                           <div className="club-tagline">
                              {tagline.trim() ||
                                 "Your tagline appears here as you fill the form."}
                           </div>
                           <div className="club-meta">
                              <span>
                                 <Icon size={11}>
                                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                    <circle cx="9" cy="7" r="4" />
                                 </Icon>{" "}
                                 <b>{isSuperAdmin ? coordinators.length : 1}</b>{" "}
                                 members
                              </span>
                              <span>
                                 <Icon size={11}>
                                    <rect
                                       x="3"
                                       y="4"
                                       width="18"
                                       height="18"
                                       rx="2"
                                    />
                                    <line x1="16" y1="2" x2="16" y2="6" />
                                    <line x1="8" y1="2" x2="8" y2="6" />
                                 </Icon>{" "}
                                 <b>0</b> events
                              </span>
                              {foundedYear && (
                                 <span>
                                    Est. <b>{foundedYear}</b>
                                 </span>
                              )}
                           </div>
                           {tags.length > 0 && (
                              <div className="club-tags">
                                 {tags.slice(0, 4).map((t) => (
                                    <span key={t} className="club-tag">
                                       {t}
                                    </span>
                                 ))}
                              </div>
                           )}
                           <div className="club-foot">
                              <span
                                 className={`club-policy ${policyObj.apiValue}`}
                              >
                                 <span className="dot" />
                                 {policyObj.label}
                              </span>
                              <button
                                 type="button"
                                 className="join-btn"
                                 disabled
                              >
                                 {JOIN_PREVIEW[policyObj.apiValue]}
                              </button>
                           </div>
                        </div>
                     </div>
                  </div>
               </div>

               {/* FOOTER */}
               <div className="wizard-footer">
                  <div className="step-progress">Step {step} of 4</div>
                  <div className="footer-actions">
                     <button
                        className="btn btn-ghost"
                        disabled={step === 1 || creating}
                        onClick={() => goTo(step - 1)}
                     >
                        ← Back
                     </button>
                     {step < 4 ? (
                        <button
                           className="btn btn-primary btn-large"
                           onClick={() => goTo(step + 1)}
                        >
                           Continue
                           <Icon size={14} strokeWidth={2.5}>
                              <line x1="5" y1="12" x2="19" y2="12" />
                              <polyline points="12 5 19 12 12 19" />
                           </Icon>
                        </button>
                     ) : (
                        <button
                           className="btn btn-primary btn-large"
                           onClick={publish}
                           disabled={creating}
                        >
                           {creating ? "Creating…" : "Create club"}
                        </button>
                     )}
                  </div>
               </div>
            </div>

            {/* SUCCESS — reuses the ConfirmModal (cm-) shell for matching styling/transitions. */}
            {created && (
               <div className="cm-overlay" onClick={(e) => e.stopPropagation()}>
                  <div
                     className="cm-dialog"
                     role="alertdialog"
                     aria-modal="true"
                     onClick={(e) => e.stopPropagation()}
                  >
                     <div
                        className="success-logo"
                        style={{ background: gradient }}
                     >
                        {mono}
                     </div>
                     <h3 className="cm-title">{name.trim()} is live! 🎉</h3>
                     <p className="cm-message">
                        {isSuperAdmin
                           ? "Assigned coordinators can now add members and schedule events."
                           : "You're now the coordinator. Start by adding members and scheduling your first event."}
                     </p>
                     <div
                        className={`success-status${created.verified ? " ok" : ""}`}
                     >
                        {created.verified ? (
                           <>
                              <Icon size={13} strokeWidth={2.6}>
                                 <polyline points="20 6 9 17 4 12" />
                              </Icon>
                              Verified by institute
                           </>
                        ) : (
                           <>
                              <Icon size={13} strokeWidth={2.4}>
                                 <circle cx="12" cy="12" r="10" />
                                 <polyline points="12 6 12 12 16 14" />
                              </Icon>
                              Pending Super Admin verification
                           </>
                        )}
                     </div>
                     <div className="cm-actions">
                        <button
                           type="button"
                           className="cm-btn cancel"
                           onClick={reset}
                        >
                           Create another
                        </button>
                        <button
                           type="button"
                           className="cm-btn confirm"
                           onClick={() => navigate(`/clubs/${created.slug}`)}
                        >
                           Go to club
                        </button>
                     </div>
                  </div>
               </div>
            )}
         </div>
      </AppShell>
   );
}
