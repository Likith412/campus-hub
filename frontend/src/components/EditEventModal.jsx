// Edit-event modal — anyone with events:edit on the club updates a live or draft event.
// Same shape as EditClubModal: self-contained, calls the API, then onChanged() so the
// caller can refetch. Creating still lives on its own page (the form is longer there).
import { useState } from "react";
import { eventsApi, ApiError } from "../services";
import { useToast } from "../contexts/ToastContext";
import { nowLocalInput, toLocalInput } from "../utils/events";
import Icon from "./Icon";
import useModalChrome from "../hooks/useModalChrome";

const EVENT_TYPES = [
   { id: "workshop", label: "🛠 Workshop" },
   { id: "contest", label: "⚡ Contest" },
   { id: "hackathon", label: "💻 Hackathon" },
   { id: "seminar", label: "🎤 Seminar" },
   { id: "fun", label: "🎉 Social" },
];

const VISIBILITIES = [
   { id: "public", label: "Public", desc: "Anyone on campus can register" },
   { id: "private", label: "Members only", desc: "Only your club's members" },
];

const MODES = [
   { id: "offline", label: "On campus" },
   { id: "online", label: "Online" },
   { id: "hybrid", label: "Hybrid" },
];

export default function EditEventModal({
   event,
   club,
   slug,
   onClose,
   onChanged,
}) {
   const toast = useToast();
   const [busy, setBusy] = useState(false);

   useModalChrome(onClose, { disabled: busy });
   const [errors, setErrors] = useState({});
   // A past event keeps its own start as the floor, so an untouched date isn't flagged;
   // anything still ahead of us can only move forward.
   const startedAlready = new Date(event.startAt) <= new Date();
   const minDateTime = startedAlready
      ? toLocalInput(event.startAt)
      : nowLocalInput();

   const [title, setTitle] = useState(event.title || "");
   const [eventType, setEventType] = useState(event.eventType);
   const [description, setDescription] = useState(event.description || "");
   const [tags, setTags] = useState(event.tags || []);
   const [tagDraft, setTagDraft] = useState("");
   const [mode, setMode] = useState(event.venue?.type || "offline");
   const [location, setLocation] = useState(event.venue?.location || "");
   const [meetingUrl, setMeetingUrl] = useState(event.venue?.meetingUrl || "");
   const [startAt, setStartAt] = useState(toLocalInput(event.startAt));
   const [endAt, setEndAt] = useState(toLocalInput(event.endAt));
   const [deadline, setDeadline] = useState(
      toLocalInput(event.registrationDeadline),
   );
   const [capacity, setCapacity] = useState(
      event.capacity ? String(event.capacity) : "",
   );
   const [waitlistEnabled, setWaitlistEnabled] = useState(
      !!event.waitlistEnabled,
   );
   const [visibility, setVisibility] = useState(event.visibility || "private");

   const addTag = () => {
      const t = tagDraft.trim().slice(0, 40);
      if (t && tags.length < 10 && !tags.includes(t)) setTags([...tags, t]);
      setTagDraft("");
   };

   // Mirrors the server rules so the common mistakes never round-trip.
   function validate() {
      const next = {};
      if (title.trim().length < 3) next.title = "Give the event a title";
      if (!startAt) next.startAt = "Pick a start time";
      else if (
         // Only a *changed* start has to be in the future — see updateEvent.
         startAt !== toLocalInput(event.startAt) &&
         new Date(startAt) <= new Date()
      ) {
         next.startAt = "Start time must be in the future";
      }
      if (!endAt) next.endAt = "Pick an end time";
      if (startAt && endAt && new Date(endAt) <= new Date(startAt)) {
         next.endAt = "End time must be after the start time";
      }
      if (deadline) {
         if (new Date(deadline) > new Date(startAt)) {
            next.deadline = "Registration must close before the event starts";
         } else if (
            deadline !== toLocalInput(event.registrationDeadline) &&
            new Date(deadline) <= new Date()
         ) {
            next.deadline = "Registration deadline must be in the future";
         }
      }
      if (mode !== "online" && !location.trim()) {
         next.location = "Where is it happening?";
      }
      if (mode !== "offline" && !meetingUrl.trim()) {
         next.meetingUrl = "Add the meeting link";
      }
      setErrors(next);
      return Object.keys(next).length === 0;
   }

   async function save() {
      if (!validate()) return;
      setBusy(true);
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
            description: description.trim(),
            tags,
         };
         // null, not "omitted" — an emptied field has to reach the server to clear it.
         body.registrationDeadline = deadline
            ? new Date(deadline).toISOString()
            : null;

         const res = await eventsApi.updateEvent(slug, event.id, body);
         // Raising the cap pulls people off the waitlist — say so, it isn't obvious.
         toast.success(
            res?.promotedCount
               ? `Saved · ${res.promotedCount} moved off the waitlist`
               : "Changes saved",
         );
         onChanged();
      } catch (err) {
         toast.error(
            err instanceof ApiError ? err.message : "Couldn't save the event",
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
               <div className="fac-modal-title">Edit event</div>
               <div className="fac-modal-sub">
                  {event.status === "draft"
                     ? "Still a draft — only your team can see it."
                     : "This event is live; changes show up straight away."}
               </div>
            </div>

            <div className="fac-modal-body ec-body">
               <div className="create-event">
                  <div className="field">
                     <label className="label">
                        Event title <span className="req">*</span>
                     </label>
                     <input
                        className="input"
                        value={title}
                        onChange={(e) => setTitle(e.target.value.slice(0, 120))}
                        maxLength={120}
                     />
                     {errors.title && (
                        <div className="ce-err">{errors.title}</div>
                     )}
                  </div>

                  <div className="field">
                     <label className="label">Type</label>
                     <div className="ce-chips">
                        {EVENT_TYPES.map((t) => (
                           <button
                              key={t.id}
                              type="button"
                              className={`ce-chip${eventType === t.id ? " on" : ""}`}
                              onClick={() => setEventType(t.id)}
                           >
                              {t.label}
                           </button>
                        ))}
                     </div>
                  </div>

                  <div className="field">
                     <label className="label">Short description</label>
                     <textarea
                        className="textarea"
                        rows={3}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
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
                  </div>

                  <div className="field-row">
                     <div className="field">
                        <label className="label">Starts</label>
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
                        <label className="label">Ends</label>
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
                     <div className="ce-chips">
                        {MODES.map((m) => (
                           <button
                              key={m.id}
                              type="button"
                              className={`ce-chip${mode === m.id ? " on" : ""}`}
                              onClick={() => setMode(m.id)}
                           >
                              {m.label}
                           </button>
                        ))}
                     </div>
                  </div>

                  {mode !== "online" && (
                     <div className="field">
                        <label className="label">Venue</label>
                        <input
                           className="input"
                           value={location}
                           onChange={(e) => setLocation(e.target.value)}
                           maxLength={200}
                        />
                        {errors.location && (
                           <div className="ce-err">{errors.location}</div>
                        )}
                     </div>
                  )}

                  {mode !== "offline" && (
                     <div className="field">
                        <label className="label">Meeting link</label>
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

                  <div className="field-row">
                     <div className="field">
                        <label className="label">Registration closes</label>
                        <input
                           className="input"
                           type="datetime-local"
                           min={minDateTime}
                           max={startAt}
                           value={deadline}
                           onChange={(e) => setDeadline(e.target.value)}
                        />
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
                           placeholder="Blank for unlimited"
                        />
                        <div className="ce-help">
                           Can't go below the {event.registeredCount} already
                           registered.
                        </div>
                     </div>
                  </div>

                  <div className="field">
                     <label className="label">Who can join</label>
                     <div className="ef-visibility">
                        {VISIBILITIES.map((v) => {
                           // Only a verified club may go campus-wide.
                           const locked = v.id === "public" && !club?.verified;
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
                  </div>

                  <label className="ce-toggle">
                     <input
                        type="checkbox"
                        checked={waitlistEnabled}
                        onChange={(e) => setWaitlistEnabled(e.target.checked)}
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
                  <Icon size={14} strokeWidth={2.5}>
                     <path d="M20 6 9 17l-5-5" />
                  </Icon>
                  {busy ? "Saving…" : "Save changes"}
               </button>
            </div>
         </div>
      </div>
   );
}
