// Shared helpers for the events controllers (lifecycle + registrations).
const { Club, Event, EventRegistration } = require("../../models");
const { NotFoundError, ForbiddenError } = require("../../utils/errors");
const { resolveClubContexts, contextCan } = require("../clubs/helpers");

// Sort options shared by every event listing (club, public feed, admin).
const EVENT_SORT = {
   soonest: { startAt: 1 },
   latest: { startAt: -1 },
   popular: { "stats.registered": -1, startAt: 1 },
   new: { createdAt: -1 },
};

// Statuses that hold or queue for a seat — i.e. "you are on this event".
const LIVE_REGISTRATION_STATUSES = ["registered", "waitlisted"];

// Seats left, or null when the event is uncapped (capacity 0).
function seatsLeft(event) {
   if (!event.capacity) return null;
   return Math.max(0, event.capacity - (event.stats?.registered || 0));
}

// Registration closes at the deadline when set, otherwise when the event starts.
function registrationClosesAt(event) {
   return event.registrationDeadline || event.startAt;
}

function isRegistrationOpen(event, now = new Date()) {
   return event.status === "published" && now <= registrationClosesAt(event);
}

// Trim a club (a doc or an aggregation $lookup row) down to what an event needs.
// A card only ever prints the name; the slug, the cover colours and the verified flag
// are read on the detail page (its header, and the edit form's "public" rule).
function eventClub(club, full = false) {
   if (!club) return null;
   // slug is back on the row: cancelling an event from a card posts to the club-scoped
   // route, and a cross-club list has no other way to name the host.
   const row = { name: club.name, slug: club.slug };
   if (!full) return row;
   return {
      ...row,
      verified: !!club.verified,
      coverFrom: club.coverFrom || null,
      coverTo: club.coverTo || null,
   };
}

// Wire shape of an event. `club` and `viewerStatus` are folded in when the caller has
// them. `full` adds the fields only the detail page and the edit form read — list rows
// never render a description, so they don't carry one.
function publicEvent(e, { club, viewerStatus, full = false, can } = {}) {
   const left = seatsLeft(e);
   const row = {
      id: e._id,
      club: eventClub(club, full),
      title: e.title,
      eventType: e.eventType,
      status: e.status,
      visibility: e.visibility || "private",
      startAt: e.startAt,
      endAt: e.endAt,
      // Drives the card's closing-soon flag — the strongest "act now" signal a list can
      // carry, and the reason a card is worth clicking today rather than next week.
      registrationClosesAt: registrationClosesAt(e),
      // Cards print the type glyph and the location; the join link is a detail field.
      venue: {
         type: e.venue?.type || null,
         location: e.venue?.location || null,
      },
      capacity: e.capacity || 0,
      registeredCount: e.stats?.registered || 0,
      seatsLeft: left,
      isFull: left === 0,
      registrationOpen: isRegistrationOpen(e),
      // A full event's card offers "Join waitlist" instead of a dead "Full" label, so
      // the list needs this too — it's one boolean.
      waitlistEnabled: !!e.waitlistEnabled,
      // Only set when the caller asked for their own standing — null means "not registered".
      viewerStatus: viewerStatus ?? null,
      // What the viewer may do with this event, resolved per club. Cross-club lists
      // span many clubs, so the answer can differ row to row.
      canEdit: !!can?.canEdit,
      canPublish: !!can?.canPublish,
      canCancel: !!can?.canCancel,
   };
   if (!full) return row;
   return {
      ...row,
      venue: { ...row.venue, meetingUrl: e.venue?.meetingUrl || null },
      description: e.description || null,
      registrationDeadline: e.registrationDeadline || null,
      tags: e.tags || [],
   };
}

// Per-club edit/cancel rights for a page of events, in two queries for the whole page.
// The card shows management controls wherever it appears, so every cross-club list has
// to answer this — and each row can answer differently.
async function eventCapabilities(user, clubIds) {
   const ctxByClub = await resolveClubContexts(user, clubIds);
   const out = new Map();
   for (const [clubId, ctx] of ctxByClub) {
      out.set(clubId, {
         canEdit: contextCan(ctx, "events:edit"),
         canPublish: contextCan(ctx, "events:publish"),
         canCancel: contextCan(ctx, "events:cancel"),
      });
   }
   return out;
}

// Fields the row shape above reads. Detail callers need the whole document.
const EVENT_ROW_FIELDS =
   "clubId title eventType status visibility startAt endAt registrationDeadline waitlistEnabled venue.type venue.location capacity stats.registered";

// Move the longest-waiting people off the waitlist into `slots` freed seats, and keep
// stats.registered in step. Used when someone cancels and when capacity is raised.
async function promoteWaitlisted(eventId, slots) {
   if (slots <= 0) return [];

   const promoted = [];
   for (let i = 0; i < slots; i++) {
      // Claim the seat on the event first, exactly the way registerForEvent does. Doing
      // it in that order is what keeps the count honest: flipping the waitlist row first
      // and adding up the seats at the end leaves a window where a concurrent
      // registration still sees the old count and takes a seat promotion already gave
      // away. The condition also caps promotion at the event's own capacity, which
      // matters when an edit lowers capacity and frees seats in the same request.
      // Capacity 0 means uncapped.
      const seated = await Event.findOneAndUpdate(
         {
            _id: eventId,
            $or: [
               { capacity: 0 },
               { $expr: { $lt: ["$stats.registered", "$capacity"] } },
            ],
         },
         { $inc: { "stats.registered": 1 } },
      );
      if (!seated) break; // no room left, or the event is gone

      // One atomic claim per row, not a batch read-then-write: two callers racing on the
      // same event (concurrent cancellations, or a cancellation racing an edit's own
      // eviction) would otherwise both read the same top-of-queue row before either
      // writes it. findOneAndUpdate claims and flips the oldest still-waitlisted row in
      // one operation, so a second caller always finds a different row and moves on.
      const row = await EventRegistration.findOneAndUpdate(
         { eventId, status: "waitlisted" },
         { $set: { status: "registered" } },
         { sort: { registeredAt: 1 }, returnDocument: "after" },
      );
      if (!row) {
         // Nobody left waiting — give the seat back rather than leaking it.
         await Event.updateOne(
            { _id: eventId },
            { $inc: { "stats.registered": -1 } },
         );
         break;
      }
      promoted.push(row);
   }
   return promoted;
}

// Give up every seat this user still holds on events that haven't ended, and let the
// waitlist take the freed ones. `eventFilter` narrows which events — the whole platform
// when an account is deleted, one club's members-only events when someone leaves it.
// Returns how many registrations were released.
async function releaseSeats(userId, eventFilter = {}) {
   const events = await Event.find({ ...eventFilter, endAt: { $gte: new Date() } })
      .select("_id")
      .lean();
   if (events.length === 0) return 0;

   const live = await EventRegistration.find({
      userId,
      eventId: { $in: events.map((e) => e._id) },
      status: { $in: LIVE_REGISTRATION_STATUSES },
   })
      .select("eventId status")
      .lean();
   if (live.length === 0) return 0;

   const cancelledAt = new Date();
   let released = 0;
   for (const reg of live) {
      // Guard on the status: the row may have been cancelled since the read above, and
      // only the write that actually moves it may hand the seat back.
      const prev = await EventRegistration.findOneAndUpdate(
         { _id: reg._id, status: { $in: LIVE_REGISTRATION_STATUSES } },
         { $set: { status: "cancelled", cancelledAt } },
         { returnDocument: "before" },
      );
      if (!prev) continue;
      released += 1;
      // A waitlisted row was never holding a seat, so there is nothing to give back.
      if (prev.status !== "registered") continue;
      await Event.updateOne(
         { _id: reg.eventId },
         { $inc: { "stats.registered": -1 } },
      );
      await promoteWaitlisted(reg.eventId, 1);
   }
   return released;
}

// A club's event count only ever grows, and only when an event goes live: drafts don't
// count, and drafts are the only thing that can be deleted. So publishing is the one
// transition that moves it.
async function countPublishedEvent(clubId) {
   await Club.updateOne({ _id: clubId }, { $inc: { "stats.eventCount": 1 } });
}

// Only a verified club may put an event in front of the whole campus.
function assertCanBePublic(club, visibility) {
   if (visibility === "public" && !club.verified) {
      throw new ForbiddenError(
         "Only verified clubs can create public events — this one can be private until the club is verified",
      );
   }
}

// Load one event that belongs to `clubId` — the guard behind every club-scoped write.
async function findClubEvent(clubId, eventId) {
   const event = await Event.findOne({ _id: eventId, clubId });
   if (!event) throw new NotFoundError("Event not found");
   return event;
}

// The caller's standing across a page of events, as eventId → status. One query per page
// instead of one per card.
async function viewerRegistrationMap(userId, eventIds) {
   if (!userId || eventIds.length === 0) return new Map();
   const rows = await EventRegistration.find({
      userId,
      eventId: { $in: eventIds },
      status: { $in: LIVE_REGISTRATION_STATUSES },
   })
      .select("eventId status")
      .lean();
   return new Map(rows.map((r) => [String(r.eventId), r.status]));
}

module.exports = {
   EVENT_ROW_FIELDS,
   eventCapabilities,
   EVENT_SORT,
   LIVE_REGISTRATION_STATUSES,
   registrationClosesAt,
   publicEvent,
   findClubEvent,
   assertCanBePublic,
   promoteWaitlisted,
   releaseSeats,
   countPublishedEvent,
   viewerRegistrationMap,
};
