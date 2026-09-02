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
