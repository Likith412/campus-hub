// Event registrations controller — taking a seat, giving it up, the waitlist, and the
// rosters behind "my events" and the attendee list.
// Students register; faculty and superAdmins run events rather than attend them.
// A public event is open to any student; a private one is for the club's members.
const { successResponse, pageMeta } = require("../../utils/response");
const {
   NotFoundError,
   ForbiddenError,
   ConflictError,
} = require("../../utils/errors");
const {
   Club,
   ClubMembership,
   Event,
   EventRegistration,
} = require("../../models");
const { ROLES } = require("../../constants/roles");
const { escapeRegex } = require("../../utils/escapeRegex");
const {
   LIVE_REGISTRATION_STATUSES,
   publicEvent,
   publicRegistration,
   registrationClosesAt,
   findClubEvent,
   promoteWaitlisted,
} = require("./helpers");

// POST /api/events/:eventId/register — take a seat, or join the waitlist when full.
// Students only, plus club membership when the event is private; beyond that the event
// just has to be published, still open, and not full.
async function registerForEvent(req, res) {
   const userId = req.user._id;

   // Staff organise events; only students take part in them. Mirrors the UI, which
   // shows the register control to students alone.
   if (req.user.role !== ROLES.STUDENT) {
      throw new ForbiddenError("Only students can register for events");
   }

   const event = await Event.findById(req.params.eventId);
   if (!event) throw new NotFoundError("Event not found");

   const club = await Club.findById(event.clubId).lean();
   if (!club || club.status !== "active") throw new NotFoundError("Event not found");

   if (event.status !== "published") {
      throw new ConflictError("This event isn't open for registration");
   }

   // Private events are a club benefit — public ones are open to any student.
   if (event.visibility === "private") {
      const membership = await ClubMembership.findOne({
         userId,
         clubId: event.clubId,
         status: "approved",
      })
         .select("_id")
         .lean();
      if (!membership) {
         throw new ForbiddenError(
            "This event is for club members — join the club to register",
         );
      }
   }

   const now = new Date();
   if (now > registrationClosesAt(event)) {
      throw new ConflictError("Registration for this event has closed");
   }

   const existing = await EventRegistration.findOne({
      eventId: event._id,
      userId,
   }).lean();
   if (existing && LIVE_REGISTRATION_STATUSES.includes(existing.status)) {
      throw new ConflictError(
         existing.status === "waitlisted"
            ? "You're already on the waitlist"
            : "You're already registered",
      );
   }

   // Claim a seat atomically: the capacity test and the counter bump are one write, so two
   // simultaneous registrations can't both take the last seat. Null means the event filled up.
   const seated = await Event.findOneAndUpdate(
      {
         _id: event._id,
         status: "published",
         $or: [
            { capacity: 0 }, // 0 = unlimited
            { $expr: { $lt: ["$stats.registered", "$capacity"] } },
         ],
      },
      { $inc: { "stats.registered": 1 } },
      { returnDocument: "after" },
   );

   if (!seated && !event.waitlistEnabled) {
      throw new ConflictError("This event is full");
   }

   const status = seated ? "registered" : "waitlisted";

   try {
      // Upsert onto a row that isn't already holding a seat. A concurrent duplicate finds
      // no match, tries to insert, and loses to the unique index — caught below.
      const registration = await EventRegistration.findOneAndUpdate(
         {
            eventId: event._id,
            userId,
            status: { $nin: LIVE_REGISTRATION_STATUSES },
         },
         { $set: { status, registeredAt: now, cancelledAt: null } },
         { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
      );

      return successResponse(
         res,
         201,
         seated ? "Registered" : "Added to the waitlist",
         {
            registration: publicRegistration(registration),
            event: publicEvent(seated || event, { club, viewerStatus: status }),
         },
      );
   } catch (err) {
      // Hand the seat back if the registration write failed (e.g. a racing duplicate).
      if (seated) {
         await Event.updateOne(
            { _id: event._id },
            { $inc: { "stats.registered": -1 } },
         );
      }
      if (err?.code === 11000) {
         throw new ConflictError("You're already registered");
      }
      throw err;
   }
}

// DELETE /api/events/:eventId/register — give up a seat; the oldest waitlister takes it.
async function unregisterFromEvent(req, res) {
   const userId = req.user._id;
   const event = await Event.findById(req.params.eventId);
   if (!event) throw new NotFoundError("Event not found");

   const registration = await EventRegistration.findOne({
      eventId: event._id,
      userId,
   });
   if (
      !registration ||
      !LIVE_REGISTRATION_STATUSES.includes(registration.status)
   ) {
      throw new NotFoundError("You're not registered for this event");
   }

   if (event.startAt < new Date()) {
      throw new ConflictError("This event has already started");
   }

   // Flip the row atomically: only the write that actually moved it off a live status
   // may give the seat back, or two concurrent cancels decrement twice for one seat.
   const cancelledAt = new Date();
   const prev = await EventRegistration.findOneAndUpdate(
      { _id: registration._id, status: { $in: LIVE_REGISTRATION_STATUSES } },
      { $set: { status: "cancelled", cancelledAt } },
      { returnDocument: "before" },
   );
   if (!prev) throw new NotFoundError("You're not registered for this event");
   const heldSeat = prev.status === "registered";

   // Only a confirmed seat frees anything up. Hand it to the person who has waited longest;
   // if nobody is waiting, drop the counter instead.
   let promoted = [];
   if (heldSeat) {
      await Event.updateOne(
         { _id: event._id },
         { $inc: { "stats.registered": -1 } },
      );
      promoted = await promoteWaitlisted(event._id, 1);
   }

   return successResponse(res, 200, "Registration cancelled", {
      registration: publicRegistration({
         ...prev.toObject(),
         status: "cancelled",
         cancelledAt,
      }),
      promotedUserId: promoted[0]?.userId || null,
   });
}

// GET /api/events/me — the caller's own registrations, upcoming or past.
async function listMyEvents(req, res) {
   const { when, q, type, status, sort, page, limit } = req.validatedQuery;
   const now = new Date();
   const skip = (page - 1) * limit;

   // `status` filters the registration row, so it goes in the first $match — before
   // the join, where the index on { userId, status } can still serve it.
   const regMatch = {
      userId: req.user._id,
      status: status ? status : { $in: LIVE_REGISTRATION_STATUSES },
   };

   // The rest describe the event, so they can only run once the lookup has landed.
   const eventMatch = {
      "event.endAt": when === "past" ? { $lt: now } : { $gte: now },
   };
   if (type) eventMatch["event.eventType"] = type;
   if (q) {
      eventMatch["event.title"] = { $regex: escapeRegex(q), $options: "i" };
   }

   // Past defaults to most-recent-first, upcoming to soonest — overridable.
   const order = sort ? (sort === "latest" ? -1 : 1) : when === "past" ? -1 : 1;

   const [agg] = await EventRegistration.aggregate([
      { $match: regMatch },
      {
         $lookup: {
            from: "events",
            localField: "eventId",
            foreignField: "_id",
            as: "event",
         },
      },
      { $unwind: "$event" },
      { $match: eventMatch },
      {
         $lookup: {
            from: "clubs",
            localField: "event.clubId",
            foreignField: "_id",
            as: "club",
         },
      },
      { $unwind: { path: "$club", preserveNullAndEmptyArrays: true } },
      {
         $facet: {
            rows: [
               { $sort: { "event.startAt": order } },
               { $skip: skip },
               { $limit: limit },
            ],
            total: [{ $count: "n" }],
         },
      },
   ]);

   const rows = agg?.rows || [];
   const total = agg?.total?.[0]?.n || 0;

   return successResponse(res, 200, "My events", {
      items: rows.map((r) =>
         publicEvent(r.event, { club: r.club, viewerStatus: r.status }),
      ),
      pagination: pageMeta(page, limit, total, rows.length),
   });
}

// GET /api/clubs/:slug/events/:eventId/attendees — who signed up. Gated on events:edit.
async function listAttendees(req, res) {
   const { q, status, page, limit } = req.validatedQuery;
   const club = req.club; // resolved + events:edit asserted by requireClubPermission
   const event = await findClubEvent(club._id, req.params.eventId);

   const match = { eventId: event._id };
   // Default view is everyone still on the event (cancellations are opt-in).
   match.status = status ? status : { $in: LIVE_REGISTRATION_STATUSES };

   const skip = (page - 1) * limit;

   // The user join happens before the facet now: searching by name or email has to
   // filter (and therefore count) on the joined document, not just the page of it.
   const [agg] = await EventRegistration.aggregate([
      { $match: match },
      {
         $lookup: {
            from: "users",
            localField: "userId",
            foreignField: "_id",
            as: "user",
         },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
      ...(q
         ? [
              {
                 $match: {
                    $or: [
                       { "user.name": { $regex: escapeRegex(q), $options: "i" } },
                       { "user.email": { $regex: escapeRegex(q), $options: "i" } },
                    ],
                 },
              },
           ]
         : []),
      {
         $facet: {
            rows: [
               // Confirmed seats first, then the waitlist in the order people joined it.
               { $sort: { status: 1, registeredAt: 1 } },
               { $skip: skip },
               { $limit: limit },
            ],
            total: [{ $count: "n" }],
         },
      },
   ]);

   const rows = agg?.rows || [];
   const total = agg?.total?.[0]?.n || 0;

   return successResponse(res, 200, "Attendees", {
      event: publicEvent(event, { club }),
      items: rows.map((r) => ({
         userId: r.user?._id || r.userId,
         name: r.user?.name || "Unknown",
         email: r.user?.email || null,
         department: r.user?.profile?.department || null,
         year: r.user?.profile?.year || null,
         status: r.status,
         registeredAt: r.registeredAt,
      })),
      pagination: pageMeta(page, limit, total, rows.length),
   });
}

module.exports = {
   registerForEvent,
   unregisterFromEvent,
   listMyEvents,
   listAttendees,
};
