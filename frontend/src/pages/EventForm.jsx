// Create an event — /clubs/:slug/events/new. A five-step wizard following
// .design/Event Creation Wizard.html, built on the same chrome as the club wizard
// (see the `create-club` class below). Editing happens in EditEventModal, not here.
// Gated on events:create (the route is open, the page and the controller both check).
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { clubsApi, eventsApi, ApiError } from "../services";
import AppShell from "../components/layout/AppShell";
import Icon from "../components/Icon";
import { LoadingBlock } from "../components/Spinner";
import { useToast } from "../contexts/ToastContext";
import {
   EVENT_TYPE_LABEL,
   EVENT_COVER_CLASS,
   eventDateParts,
   formatDuration,
   formatEventWhen,
   formatVenue,
   nowLocalInput,
   toLocalInput,
} from "../utils/events";

const STEPS = [
   "Event type",
   "Basic info",
   "Schedule",
   "Rules & access",
   "Review & publish",
];

const EVENT_TYPES = [
   { id: "workshop", label: "🛠 Workshop", desc: "Hands-on, teach something" },
   { id: "contest", label: "⚡ Contest", desc: "Timed, ranked, competitive" },
   { id: "hackathon", label: "💻 Hackathon", desc: "Build over hours or days" },
   { id: "seminar", label: "🎤 Seminar", desc: "A talk, panel or Q&A" },
   { id: "fun", label: "🎉 Social", desc: "Meetups and everything lighter" },
];

const VISIBILITIES = [
   {
      id: "public",
      label: "Public",
      desc: "Anyone on campus can find it and register",
   },
   {
      id: "private",
      label: "Members only",
      desc: "Visible to your club's members, and only they can register",
   },
];

const MODES = [
   { id: "offline", label: "On campus" },
   { id: "online", label: "Online" },
   { id: "hybrid", label: "Hybrid" },
];

function defaultStart() {
   const d = new Date();
   d.setDate(d.getDate() + 7);
   d.setHours(10, 0, 0, 0);
   return d;
}

export default function EventForm() {
   const { slug } = useParams();
   const navigate = useNavigate();
   const toast = useToast();

   const [club, setClub] = useState(null);
   const [allowed, setAllowed] = useState(false);
   const [loaded, setLoaded] = useState(false);
   const [saving, setSaving] = useState(false);
   const [step, setStep] = useState(1);
   const [errors, setErrors] = useState({});
   // Floor for every picker — a new event can only be scheduled forward.
   const minDateTime = nowLocalInput();

   const start = defaultStart();
   const [title, setTitle] = useState("");
   const [eventType, setEventType] = useState("workshop");
   const [description, setDescription] = useState("");
   const [tags, setTags] = useState([]);
   const [tagDraft, setTagDraft] = useState("");
   const [mode, setMode] = useState("offline");
   const [location, setLocation] = useState("");
   const [meetingUrl, setMeetingUrl] = useState("");
   const [startAt, setStartAt] = useState(toLocalInput(start));
   const [endAt, setEndAt] = useState(
      toLocalInput(new Date(start.getTime() + 2 * 60 * 60 * 1000)),
   );
   const [deadline, setDeadline] = useState("");
   const [capacity, setCapacity] = useState("");
   const [waitlistEnabled, setWaitlistEnabled] = useState(false);
   const [visibility, setVisibility] = useState("private");

   useEffect(() => {
      let cancelled = false;
      Promise.all([
         clubsApi.getClub(slug).catch(() => null),
         // listClubEvents carries the viewer's permissions for this club.
         eventsApi.listClubEvents(slug, { limit: 1 }).catch(() => null),
      ])
         .then(([c, ev]) => {
            if (cancelled) return;
            setClub(c);
            setAllowed(!!ev?.viewer?.canCreate);
         })
         .finally(() => !cancelled && setLoaded(true));
      return () => {
         cancelled = true;
      };
   }, [slug]);

   const addTag = () => {
      const t = tagDraft.trim().slice(0, 40);
      if (t && tags.length < 10 && !tags.includes(t)) setTags([...tags, t]);
      setTagDraft("");
   };

   // Per-step validation, so a mistake surfaces on the step that owns the field
   // rather than at the very end. Mirrors the server rules.
   function checkStep(n) {
      const next = {};
      if (n === 2 && title.trim().length < 3) next.title = "Give the event a title";
      if (n === 3) {
         if (!startAt) next.startAt = "Pick a start time";
         else if (new Date(startAt) <= new Date()) {
            next.startAt = "Start time must be in the future";
         }
         if (!endAt) next.endAt = "Pick an end time";
         if (startAt && endAt && new Date(endAt) <= new Date(startAt)) {
            next.endAt = "End time must be after the start time";
         }
         if (mode !== "online" && !location.trim()) {
            next.location = "Where is it happening?";
         }
         if (mode !== "offline" && !meetingUrl.trim()) {
            next.meetingUrl = "Add the meeting link";
         }
      }
      if (n === 4 && deadline) {
         if (new Date(deadline) > new Date(startAt)) {
            next.deadline = "Registration must close before the event starts";
         } else if (new Date(deadline) <= new Date()) {
            next.deadline = "Registration deadline must be in the future";
         }
      }
      return next;
   }

   function goTo(n) {
      // Moving forward validates every step being left behind; back is always free.
      if (n > step) {
         for (let i = step; i < n; i++) {
            const found = checkStep(i);
            if (Object.keys(found).length > 0) {
               setErrors(found);
               setStep(i);
               return;
            }
         }
      }
      setErrors({});
      setStep(Math.min(Math.max(n, 1), STEPS.length));
   }

   async function submit(publish) {
      for (let i = 1; i <= STEPS.length; i++) {
         const found = checkStep(i);
         if (Object.keys(found).length > 0) {
            setErrors(found);
            setStep(i);
            return;
         }
      }
      setSaving(true);
      try {
         const body = {
            title: title.trim(),
            eventType,
            startAt: new Date(startAt).toISOString(),
            endAt: new Date(endAt).toISOString(),
            venue: {
               type: mode,
               ...(mode !== "online" ? { location: location.trim() } : {}),
               ...(mode !== "offline" ? { meetingUrl: meetingUrl.trim() } : {}),
            },
            capacity: capacity === "" ? 0 : Number(capacity),
            waitlistEnabled,
            visibility,
            publish,
         };
         if (description.trim()) body.description = description.trim();
         if (deadline) body.registrationDeadline = new Date(deadline).toISOString();
         if (tags.length) body.tags = tags;

         const res = await eventsApi.createEvent(slug, body);
         toast.success(publish ? "Event published" : "Draft saved");
         navigate(
            res?.event?.id ? `/events/${res.event.id}` : `/clubs/${slug}?tab=events`,
         );
      } catch (err) {
         toast.error(
            err instanceof ApiError ? err.message : "Couldn't create the event",
         );
      } finally {
         setSaving(false);
      }
   }

   if (!loaded) {
      return (
         <AppShell title="Create event" subtitle={club?.name}>
            <div className="main">
               <LoadingBlock label="Loading" size={24} />
            </div>
         </AppShell>
      );
   }

   if (!allowed) {
      return (
         <AppShell title="Create event" subtitle={club?.name}>
            <div className="main">
               <div className="profile-empty">
                  You don't have permission to create events in this club.
               </div>
            </div>
         </AppShell>
      );
   }

   // The preview card mirrors the row this event will become on the club's events tab.
   const preview = {
      startAt: startAt || start.toISOString(),
      endAt: endAt || start.toISOString(),
      venue: { type: mode, location, meetingUrl },
   };
   const { month, day, time } = eventDateParts(preview.startAt);
   const cover = EVENT_COVER_CLASS[eventType] || eventType;
   const seats = capacity === "" ? 0 : Number(capacity);

   return (
      /* Reuses the club wizard's chrome — same stepper, panel, side and footer. */
      <AppShell title="Create event" subtitle={club?.name}>
         <div className="create-club create-event">
            <div className="wizard">
               <div className="wizard-head">
                  <div className="wizard-title">Create an event</div>
                  <div className="wizard-sub">
                     Publish it now and registration opens straight away, or save a
                     draft only your team can see.
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
                           <div className="panel-h2">What kind of event?</div>
                           <div className="panel-sub">
                              Sets the badge and cover colour members see on the card.
                           </div>
                           <div className="field">
                              <div className="chip-grid">
                                 {EVENT_TYPES.map((t) => (
                                    <span
                                       key={t.id}
                                       className={`chip${eventType === t.id ? " active" : ""}`}
                                       onClick={() => setEventType(t.id)}
                                    >
                                       {t.label}
                                    </span>
                                 ))}
                              </div>
                              <div className="help">
                                 {EVENT_TYPES.find((t) => t.id === eventType)?.desc}
                              </div>
                           </div>
                        </div>
                     )}

                     {step === 2 && (
                        <div className="step-pane active">
                           <div className="panel-h2">Basic info</div>
                           <div className="panel-sub">
                              The title is what members scan for — keep it specific.
                           </div>
                           <div className="field">
                              <label className="label">
                                 Event title <span className="req">*</span>
                              </label>
                              <input
                                 className="input"
                                 value={title}
                                 onChange={(e) => setTitle(e.target.value)}
                                 placeholder="e.g. ByteBlitz #4 — Graphs & DP"
                                 maxLength={120}
                                 autoFocus
                              />
                              {errors.title && (
                                 <div className="ce-err">{errors.title}</div>
                              )}
                           </div>
                           <div className="field">
                              <label className="label">Short description</label>
                              <textarea
                                 className="textarea"
                                 rows={4}
                                 value={description}
                                 onChange={(e) => setDescription(e.target.value)}
                                 placeholder="One paragraph that appears on the event page."
                                 maxLength={2000}
                              />
                           </div>
                           <div className="field">
                              <label className="label">
                                 Tags <span className="opt">· up to 10</span>
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
                              <div className="help">Used by search on Explore.</div>
                           </div>
                        </div>
                     )}

                     {step === 3 && (
                        <div className="step-pane active">
                           <div className="panel-h2">When &amp; where</div>
                           <div className="panel-sub">
                              Times are in your local timezone.
                           </div>
                           <div className="field-row">
                              <div className="field">
                                 <label className="label">
                                    Starts <span className="req">*</span>
                                 </label>
                                 <input
                                    className="input"
                                    type="datetime-local"
                                    min={minDateTime}
                                    value={startAt}
                                    onChange={(e) => setStartAt(e.target.value)}
                                 />
                                 {errors.startAt && (
                                    <div className="ce-err">{errors.startAt}</div>
                                 )}
                              </div>
                              <div className="field">
                                 <label className="label">
                                    Ends <span className="req">*</span>
                                 </label>
                                 <input
                                    className="input"
                                    type="datetime-local"
                                    min={startAt || minDateTime}
                                    value={endAt}
                                    onChange={(e) => setEndAt(e.target.value)}
                                 />
                                 {errors.endAt && (
                                    <div className="ce-err">{errors.endAt}</div>
                                 )}
                              </div>
                           </div>
                           <div className="field">
                              <label className="label">Mode</label>
                              <div className="chip-grid">
                                 {MODES.map((m) => (
                                    <span
                                       key={m.id}
                                       className={`chip${mode === m.id ? " active" : ""}`}
                                       onClick={() => setMode(m.id)}
                                    >
                                       {m.label}
                                    </span>
                                 ))}
                              </div>
                           </div>
                           {mode !== "online" && (
                              <div className="field">
                                 <label className="label">
                                    Venue <span className="req">*</span>
                                 </label>
                                 <input
                                    className="input"
                                    value={location}
                                    onChange={(e) => setLocation(e.target.value)}
                                    placeholder="e.g. Seminar Hall B"
                                    maxLength={200}
                                 />
                                 {errors.location && (
                                    <div className="ce-err">{errors.location}</div>
                                 )}
                              </div>
                           )}
                           {mode !== "offline" && (
                              <div className="field">
                                 <label className="label">
                                    Meeting link <span className="req">*</span>
                                 </label>
                                 <input
                                    className="input"
                                    value={meetingUrl}
                                    onChange={(e) => setMeetingUrl(e.target.value)}
                                    placeholder="https://meet.example.edu/room"
                                 />
                                 {errors.meetingUrl && (
                                    <div className="ce-err">{errors.meetingUrl}</div>
                                 )}
                              </div>
                           )}
                        </div>
                     )}

                     {step === 4 && (
                        <div className="step-pane active">
                              <div className="panel-h2">Rules &amp; access</div>
                           <div className="panel-sub">
                              Who can see this event, how many can come, and until when.
                           </div>

                           <div className="field">
                              <label className="label">Who can join</label>
                              <div className="ef-visibility">
                                 {VISIBILITIES.map((v) => {
                                    // Only a verified club may go campus-wide.
                                    const locked =
                                       v.id === "public" && !club?.verified;
                                    return (
                                       <button
                                          key={v.id}
                                          type="button"
                                          className={`ef-vis${visibility === v.id ? " on" : ""}${locked ? " locked" : ""}`}
                                          disabled={locked}
                                          onClick={() => setVisibility(v.id)}
                                       >
                                          <span className="ef-vis-name">
                                             {v.label}
                                             {locked && (
                                                <span className="ef-vis-lock">
                                                   Verified clubs only
                                                </span>
                                             )}
                                          </span>
                                          <span className="ef-vis-desc">{v.desc}</span>
                                       </button>
                                    );
                                 })}
                              </div>
                              {!club?.verified && (
                                 <div className="ce-help">
                                    {club?.name || "This club"} isn't verified yet, so its
                                    events stay members-only. A Super Admin awards the
                                    verified ✓.
                                 </div>
                              )}
                           </div>
                           <div className="field-row">
                              <div className="field">
                                 <label className="label">
                                    Registration closes
                                    <span className="opt"> · optional</span>
                                 </label>
                                 <input
                                    className="input"
                                    type="datetime-local"
                                    min={minDateTime}
                                    max={startAt}
                                    value={deadline}
                                    onChange={(e) => setDeadline(e.target.value)}
                                 />
                                 <div className="help">
                                    Defaults to the event start time.
                                 </div>
                                 {errors.deadline && (
                                    <div className="ce-err">{errors.deadline}</div>
                                 )}
                              </div>
                              <div className="field">
                                 <label className="label">Capacity</label>
                                 <input
                                    className="input"
                                    type="number"
                                    min={0}
                                    value={capacity}
                                    onChange={(e) => setCapacity(e.target.value)}
                                    placeholder="Leave blank for unlimited"
                                 />
                                 <div className="help">
                                    Blank or 0 means no seat limit.
                                 </div>
                              </div>
                           </div>
                           <label className="ce-toggle">
                              <input
                                 type="checkbox"
                                 checked={waitlistEnabled}
                                 onChange={(e) =>
                                    setWaitlistEnabled(e.target.checked)
                                 }
                              />
                              <div>
                                 <div className="ce-toggle-name">Enable waitlist</div>
                                 <div className="ce-help">
                                    Once the seats run out, members queue up and are
                                    moved in automatically when someone cancels.
                                 </div>
                              </div>
                           </label>
                        </div>
                     )}

                     {step === 5 && (
                        <div className="step-pane active">
                           <div className="panel-h2">Review &amp; publish</div>
                           <div className="panel-sub">
                              Publishing opens registration immediately. A draft stays
                              hidden until you publish it.
                           </div>
                           <div className="summary-row">
                              <div className="summary-label">Title</div>
                              <div className="summary-val">{title || "—"}</div>
                              <span className="edit-link" onClick={() => goTo(2)}>
                                 Edit
                              </span>
                           </div>
                           <div className="summary-row">
                              <div className="summary-label">Type</div>
                              <div className="summary-val">
                                 {EVENT_TYPE_LABEL[eventType]}
                              </div>
                              <span className="edit-link" onClick={() => goTo(1)}>
                                 Edit
                              </span>
                           </div>
                           <div className="summary-row">
                              <div className="summary-label">When</div>
                              <div className="summary-val">
                                 {formatEventWhen(preview.startAt, preview.endAt)}
                              </div>
                              <span className="edit-link" onClick={() => goTo(3)}>
                                 Edit
                              </span>
                           </div>
                           <div className="summary-row">
                              <div className="summary-label">Where</div>
                              <div className="summary-val">
                                 {formatVenue(preview.venue)}
                              </div>
                              <span className="edit-link" onClick={() => goTo(3)}>
                                 Edit
                              </span>
                           </div>
                           <div className="summary-row">
                              <div className="summary-label">Who can join</div>
                              <div className="summary-val">
                                 {visibility === "public"
                                    ? "Anyone on campus"
                                    : "Club members only"}
                              </div>
                              <span className="edit-link" onClick={() => goTo(4)}>
                                 Edit
                              </span>
                           </div>
                           <div className="summary-row">
                              <div className="summary-label">Capacity</div>
                              <div className="summary-val">
                                 {capacity === "" || Number(capacity) === 0
                                    ? "Unlimited"
                                    : `${capacity} seats${waitlistEnabled ? " · waitlist on" : ""}`}
                              </div>
                              <span className="edit-link" onClick={() => goTo(4)}>
                                 Edit
                              </span>
                           </div>
                           <div className="review-note">
                              <div className="ic">
                                 <Icon size={13} strokeWidth={2.4}>
                                    <circle cx="12" cy="12" r="10" />
                                    <line x1="12" y1="16" x2="12" y2="12" />
                                    <line x1="12" y1="8" x2="12.01" y2="8" />
                                 </Icon>
                              </div>
                              <div>
                                 You can edit every one of these afterwards from the
                                 event page.
                              </div>
                           </div>
                        </div>
                     )}
                  </div>

                  {/* LIVE PREVIEW — mirrors the .ev-card row on the club's events tab. */}
                  <div className="side">
                     <div className="preview-label">
                        Live preview
                        <span className="preview-pill">Updates as you type</span>
                     </div>
                     {/* Same markup as the Explore feed card, so the preview matches 1:1. */}
                     <div className="event-card">
                        <div className={`event-cover ${cover}`}>
                           <span className="ec-badge">
                              {EVENT_TYPE_LABEL[eventType]}
                           </span>
                           <div className="ec-date">
                              <div className="ec-day">{day}</div>
                              <div className="ec-month">{month}</div>
                           </div>
                        </div>
                        <div className="event-body">
                           <div className="event-title">
                              {title || "Your event title"}
                           </div>
                           <div className="event-club">{club?.name || "Your club"}</div>
                           <div className="event-meta">
                              <span>🕐 {time}</span>
                              <span>
                                 ⏱️ {formatDuration(preview.startAt, preview.endAt)}
                              </span>
                              <span>{formatVenue(preview.venue)}</span>
                           </div>
                           <div className="event-foot">
                              <div className="event-spots">
                                 {seats > 0 ? (
                                    <>
                                       <b>{seats}</b> spots left
                                    </>
                                 ) : (
                                    <>
                                       <b>0</b> registered
                                    </>
                                 )}
                              </div>
                              <span className="btn-mini">Register</span>
                           </div>
                        </div>
                     </div>
                     <div className="help" style={{ marginTop: 10 }}>
                        {capacity === "" || Number(capacity) === 0
                           ? "No seat limit — everyone who registers gets in."
                           : `${capacity} seats${waitlistEnabled ? ", then a waitlist" : ", no waitlist"}.`}
                     </div>
                  </div>
               </div>

               {/* FOOTER */}
               <div className="wizard-footer">
                  <div className="step-progress">
                     Step {step} of {STEPS.length}
                  </div>
                  <div className="footer-actions">
                     <button
                        className="btn btn-ghost"
                        disabled={step === 1 || saving}
                        onClick={() => goTo(step - 1)}
                     >
                        ← Back
                     </button>
                     {step < STEPS.length ? (
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
                        <>
                           <button
                              className="btn btn-secondary"
                              onClick={() => submit(false)}
                              disabled={saving}
                           >
                              Save as draft
                           </button>
                           <button
                              className="btn btn-primary btn-large"
                              onClick={() => submit(true)}
                              disabled={saving}
                           >
                              {saving ? "Publishing…" : "Publish event"}
                           </button>
                        </>
                     )}
                  </div>
               </div>
            </div>
         </div>
      </AppShell>
   );
}
