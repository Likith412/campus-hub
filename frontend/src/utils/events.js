// Sort options offered by every event list.
export const EVENT_SORTS = [
   { id: "soonest", label: "Date · soonest" },
   { id: "latest", label: "Date · latest" },
   { id: "popular", label: "Most registered" },
   { id: "new", label: "Recently created" },
];

// Shared event formatting + the registration state machine. ClubDetail, Explore and
// EventDetail all render the same event objects, so the rules live here once.

export const EVENT_TYPE_LABEL = {
   contest: "Contest",
   workshop: "Workshop",
   hackathon: "Hackathon",
   seminar: "Seminar",
   fun: "Fun",
};

// The same event types as dropdown options.
export const EVENT_TYPE_OPTIONS = Object.entries(EVENT_TYPE_LABEL).map(
   ([id, label]) => ({ id, label }),
);

// The design keys its contest cover gradient off "coding".
// The type picker on the create form and the edit modal. `desc` is rendered only by
// the wizard; the modal shows the label alone.
export const EVENT_TYPE_PICKER_OPTIONS = [
   { id: "workshop", label: "🛠 Workshop", desc: "Hands-on, teach something" },
   { id: "contest", label: "⚡ Contest", desc: "Timed, ranked, competitive" },
   { id: "hackathon", label: "💻 Hackathon", desc: "Build over hours or days" },
   { id: "seminar", label: "🎤 Seminar", desc: "A talk, panel or Q&A" },
   { id: "fun", label: "🎉 Social", desc: "Meetups and everything lighter" },
];

// Where an event happens. Identical in both editors.
export const VENUE_MODES = [
   { id: "offline", label: "On campus" },
   { id: "online", label: "Online" },
   { id: "hybrid", label: "Hybrid" },
];

export const EVENT_COVER_CLASS = { contest: "coding" };

// <input type="datetime-local"> wants local wall-clock time, not an ISO string.
export function toLocalInput(value) {
   if (!value) return "";
   const d = new Date(value);
   const pad = (n) => String(n).padStart(2, "0");
   return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// `min` for the date pickers — events can only be scheduled forward.
export function nowLocalInput() {
   return toLocalInput(new Date());
}

export function eventDateParts(iso) {
   const d = new Date(iso);
   return {
      day: String(d.getDate()).padStart(2, "0"),
      month: d.toLocaleDateString("en-IN", { month: "short" }),
      time: d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }),
   };
}

export function formatDuration(startAt, endAt) {
   const mins = Math.round((new Date(endAt) - new Date(startAt)) / 60000);
   if (mins >= 1440) return `${Math.round(mins / 1440)}d`;
   if (mins >= 60) return `${Number((mins / 60).toFixed(1))}hr`;
   return `${mins}min`;
}

// "Sat, 2:00 PM · 3hr" — the meta line under an event title.
export function formatEventWhen(startAt, endAt) {
   const s = new Date(startAt);
   const day = s.toLocaleDateString("en-IN", { weekday: "short" });
   const time = s.toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
   });
   return `${day}, ${time} · ${formatDuration(startAt, endAt)}`;
}

export function formatFullDate(iso) {
   if (!iso) return "—";
   return new Date(iso).toLocaleString("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
   });
}

// Just the words — for callers that draw their own icon.
export function venueText(venue) {
   if (venue?.type === "online") return "Online";
   if (venue?.type === "hybrid") return `${venue.location || "Venue TBA"} · hybrid`;
   return venue?.location || "Venue TBA";
}

// The same thing with a leading glyph, used on the compact event cards.
export function formatVenue(venue) {
   return `${venue?.type === "online" ? "💻" : "📍"} ${venueText(venue)}`;
}

// Days left to sign up — "Closes in 1d", "Closes in 12d" — on every card that can still
// be registered for. Past the deadline there's nothing to count and registerState takes
// over with "Closed".
export function closingSoon(e) {
   // No deadline set means registration runs until the event starts — the same rule the
   // server applies, so a row without the field still reads correctly.
   const closes = e.registrationClosesAt || e.startAt;
   if (!closes) return null;
   const days = Math.ceil((new Date(closes) - Date.now()) / 86400000);
   if (days < 0) return null;
   return days === 0 ? "Closes today" : `Closes in ${days}d`;
}

// The two status changes an event can go through, worded once. Publishing is one-way —
// the server only allows draft → published and offers no route back — so the dialog
// says so rather than treating it as a routine toggle.
export function statusConfirm(status, title) {
   return status === "published"
      ? {
           title: `Publish “${title}”?`,
           message:
              "It goes live straight away and registration opens. A published event can't be returned to draft — the only way to withdraw it is to cancel it.",
           confirmLabel: "Publish event",
        }
      : {
           title: `Cancel “${title}”?`,
           message:
              "Everyone who registered keeps their place on the record, but the event will show as cancelled.",
           confirmLabel: "Cancel event",
           danger: true,
        };
}

// Once you hold a seat the sign-up deadline is behind you — what's left to know is how
// long until it runs.
export function startsIn(e) {
   if (!e.startAt) return null;
   const days = Math.ceil((new Date(e.startAt) - Date.now()) / 86400000);
   if (days < 0) return null;
   return days === 0 ? "Starts today" : `Starts in ${days}d`;
}

// Has the event finished? Independent of status, unlike eventState below — a past
// draft is still past, and the server refuses to edit or publish it.
export function isOver(e) {
   return !!e.endAt && new Date(e.endAt) < new Date();
}

// Cancelled/draft win over the clock; otherwise it's past, live or upcoming.
export function eventState(e) {
   if (e.status === "cancelled") return { cls: "cancelled", label: "Cancelled" };
   if (e.status === "draft") return { cls: "draft", label: "Draft" };
   const now = Date.now();
   if (new Date(e.endAt) < now) return { cls: "past", label: "Past" };
   if (new Date(e.startAt) <= now) return { cls: "live", label: "Live" };
   return { cls: "upcoming", label: "Upcoming" };
}

// What the register control should say and do. `action` absent = nothing to click.
// null = no control at all (the event isn't registerable and you hold no seat).
export function registerState(e) {
   // A seat can't be given up once the event has started — the server refuses it — so
   // the label stays but stops being clickable.
   const started = new Date(e.startAt) <= new Date();
   if (e.viewerStatus === "registered") {
      return {
         state: "registered",
         label: "Registered",
         ...(started ? {} : { action: "leave" }),
      };
   }
   if (e.viewerStatus === "waitlisted") {
      return {
         state: "waitlisted",
         label: "Waitlisted",
         ...(started ? {} : { action: "leave" }),
      };
   }
   if (e.status !== "published") return null;
   if (!e.registrationOpen) return { state: "closed", label: "Closed" };
   if (e.isFull) {
      return e.waitlistEnabled
         ? { state: "waitlist", label: "Join waitlist", action: "register" }
         : { state: "full", label: "Full" };
   }
   return { state: "register", label: "Register", action: "register" };
}
