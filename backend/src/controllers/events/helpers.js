// Shared helpers for the events controllers (lifecycle + registrations).
const { Club, Event, EventRegistration } = require("../../models");
const { NotFoundError, ForbiddenError } = require("../../utils/errors");

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

// Trim a club (a doc or an aggregation $lookup row) down to what an event card needs.
function eventClub(club) {
   if (!club) return null;
   return {
      id: club._id,
      name: club.name,
      slug: club.slug,
      logoUrl: club.logoUrl || null,
      // The edit form needs this to know whether "public" is allowed.
      verified: !!club.verified,
      coverFrom: club.coverFrom || null,
      coverTo: club.coverTo || null,
   };
}

// Wire shape of an event. `club` and `viewerStatus` are folded in when the caller has them.
function publicEvent(e, { club, viewerStatus } = {}) {
   const left = seatsLeft(e);
   return {
      id: e._id,
      clubId: e.clubId,
      club: eventClub(club),
      title: e.title,
      description: e.description || null,
      bannerUrl: e.bannerUrl || null,
      eventType: e.eventType,
      status: e.status,
      visibility: e.visibility || "private",
      startAt: e.startAt,
      endAt: e.endAt,
      registrationDeadline: e.registrationDeadline || null,
      registrationClosesAt: registrationClosesAt(e),
      venue: {
         type: e.venue?.type || null,
         location: e.venue?.location || null,
         meetingUrl: e.venue?.meetingUrl || null,
      },
      capacity: e.capacity || 0,
      waitlistEnabled: !!e.waitlistEnabled,
      tags: e.tags || [],
      registeredCount: e.stats?.registered || 0,
      seatsLeft: left,
      isFull: left === 0,
      registrationOpen: isRegistrationOpen(e),
      // Only set when the caller asked for their own standing — null means "not registered".
      viewerStatus: viewerStatus ?? null,
      createdBy: e.createdBy || null,
      createdAt: e.createdAt,
   };
}

function publicRegistration(r) {
   return {
      id: r._id,
      eventId: r.eventId,
      userId: r.userId,
      status: r.status,
      registeredAt: r.registeredAt,
      cancelledAt: r.cancelledAt || null,
   };
}

// Move the longest-waiting people off the waitlist into `slots` freed seats, and keep
// stats.registered in step. Used when someone cancels and when capacity is raised.
async function promoteWaitlisted(eventId, slots) {
   if (slots <= 0) return [];
   const rows = await EventRegistration.find({ eventId, status: "waitlisted" })
      .sort({ registeredAt: 1 })
      .limit(slots)
      .select("_id userId")
      .lean();
   if (rows.length === 0) return [];

   // Re-assert "waitlisted" in the filter: a row cancelled since the read above must
   // not be resurrected, and the seat count has to move by what actually changed.
   const { modifiedCount } = await EventRegistration.updateMany(
      { _id: { $in: rows.map((r) => r._id) }, status: "waitlisted" },
      { $set: { status: "registered" } },
   );
   if (modifiedCount === 0) return [];
   await Event.updateOne(
      { _id: eventId },
      { $inc: { "stats.registered": modifiedCount } },
   );
   return rows.slice(0, modifiedCount);
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
   EVENT_SORT,
   LIVE_REGISTRATION_STATUSES,
   registrationClosesAt,
   publicEvent,
   publicRegistration,
   findClubEvent,
   assertCanBePublic,
   promoteWaitlisted,
   countPublishedEvent,
   viewerRegistrationMap,
};
