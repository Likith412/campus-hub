// Event lifecycle controller — browse, read, create, edit, publish/cancel, delete.
// Per-club writes are gated on events:create / events:edit / events:cancel by
// requireClubPermission, which leaves the resolved club on req.club.
const { successResponse, pageMeta } = require("../../utils/response");
const {
   NotFoundError,
   ForbiddenError,
   ConflictError,
   ValidationError,
} = require("../../utils/errors");
const { Club, Event, EventRegistration, User } = require("../../models");
const { escapeRegex } = require("../../utils/escapeRegex");
const {
   findClubBySlugFor,
   resolveClubContext,
   contextCan,
} = require("../clubs/helpers");
const {
   EVENT_SORT,
   LIVE_REGISTRATION_STATUSES,
   assertCanBePublic,
   publicEvent,
   findClubEvent,
   promoteWaitlisted,
   countPublishedEvent,
   viewerRegistrationMap,
} = require("./helpers");

// What the viewer may do with this club's events — drives the buttons the frontend shows.
function eventViewer(ctx) {
   return {
      canCreate: contextCan(ctx, "events:create"),
      canEdit: contextCan(ctx, "events:edit"),
      canPublish: contextCan(ctx, "events:publish"),
      canCancel: contextCan(ctx, "events:cancel"),
   };
}

// Drafts are visible only to the people who can act on them.
function canSeeDrafts(viewer) {
   return viewer.canCreate || viewer.canEdit || viewer.canCancel;
}

// GET /api/clubs/:slug/events — one club's events. Members see published events; anyone
// who can manage events also sees drafts.
async function listClubEvents(req, res) {
   const { status, type, visibility, when, sort, page, limit } =
      req.validatedQuery;
   const club = await findClubBySlugFor(req.user, req.params.slug);

   const ctx = await resolveClubContext(req.user, club._id);
   const viewer = eventViewer(ctx);

   const match = { clubId: club._id };
   // A private event is for the club's own members; outsiders don't see it listed.
   const isMember = !!ctx?.membership || !!ctx?.isSuperAdmin;
   const seesPrivate = isMember || canSeeDrafts(viewer);
   if (!seesPrivate) match.visibility = "public";
   if (visibility) {
      // Narrowing to public is fine for anyone; asking for private is not.
      if (visibility === "private" && !seesPrivate) {
         throw new ForbiddenError("Only members can view this club's private events");
      }
      match.visibility = visibility;
   }
   if (status) {
      if (status === "draft" && !canSeeDrafts(viewer)) {
         throw new ForbiddenError("You don't have permission to view drafts");
      }
      match.status = status;
   } else if (!canSeeDrafts(viewer)) {
      match.status = { $ne: "draft" };
   }
   if (type) match.eventType = type;

   const now = new Date();
   if (when === "upcoming") match.endAt = { $gte: now };
   else if (when === "past") match.endAt = { $lt: now };

   // Default: upcoming reads soonest-first, past reads most-recent-first.
   const order =
      EVENT_SORT[sort] || (when === "past" ? EVENT_SORT.latest : EVENT_SORT.soonest);
   const skip = (page - 1) * limit;

   const [rows, total] = await Promise.all([
      Event.find(match).sort(order).skip(skip).limit(limit).lean(),
      Event.countDocuments(match),
   ]);

   const mine = await viewerRegistrationMap(
      req.user._id,
      rows.map((r) => r._id),
   );

   return successResponse(res, 200, "Events", {
      items: rows.map((e) =>
         publicEvent(e, { club, viewerStatus: mine.get(String(e._id)) }),
      ),
      viewer,
      pagination: pageMeta(page, limit, total, rows.length),
   });
}

// GET /api/events — cross-club browse. Published events in active clubs only.
async function listPublicEvents(req, res) {
   const { q, type, when, sort, page, limit } = req.validatedQuery;
   const now = new Date();
   const skip = (page - 1) * limit;

   // The campus-wide feed is public events only — private ones live on their club page.
   const match = {
      status: "published",
      visibility: "public",
      endAt: when === "past" ? { $lt: now } : { $gte: now },
   };
   // Explore is for finding something new: anything you already hold a seat or a
   // waitlist place on drops out. Your own list lives on /my-events.
   const taken = await EventRegistration.find({
      userId: req.user._id,
      status: { $in: LIVE_REGISTRATION_STATUSES },
   })
      .select("eventId")
      .lean();
   if (taken.length) match._id = { $nin: taken.map((r) => r.eventId) };

   if (type) match.eventType = type;
   if (q) {
      const rx = { $regex: escapeRegex(q), $options: "i" };
      match.$or = [{ title: rx }, { tags: rx }];
   }

   const [agg] = await Event.aggregate([
      { $match: match },
      // Join the host club so suspended/archived clubs drop out of the feed.
      {
         $lookup: {
            from: "clubs",
            localField: "clubId",
            foreignField: "_id",
            as: "club",
         },
      },
      { $unwind: "$club" },
      { $match: { "club.status": "active" } },
      {
         $facet: {
            rows: [
               {
                  $sort:
                     EVENT_SORT[sort] ||
                     (when === "past" ? EVENT_SORT.latest : EVENT_SORT.soonest),
               },
               { $skip: skip },
               { $limit: limit },
            ],
            total: [{ $count: "n" }],
         },
      },
   ]);

   const rows = agg?.rows || [];
   const total = agg?.total?.[0]?.n || 0;
   const mine = await viewerRegistrationMap(
      req.user._id,
      rows.map((r) => r._id),
   );

   return successResponse(res, 200, "Events", {
      items: rows.map((e) =>
         publicEvent(e, { club: e.club, viewerStatus: mine.get(String(e._id)) }),
      ),
      pagination: pageMeta(page, limit, total, rows.length),
   });
}

// GET /api/events/:eventId — one event, with the caller's own registration status.
async function getEvent(req, res) {
   const event = await Event.findById(req.params.eventId).lean();
   if (!event) throw new NotFoundError("Event not found");

   const club = await Club.findById(event.clubId).lean();
   if (!club) throw new NotFoundError("Event not found");
   // Reuse the club's own visibility rule (inactive clubs are superAdmin-only).
   await findClubBySlugFor(req.user, club.slug);

   const ctx = await resolveClubContext(req.user, club._id);
   const viewer = eventViewer(ctx);
   if (event.status === "draft" && !canSeeDrafts(viewer)) {
      throw new NotFoundError("Event not found");
   }
   const isMember = !!ctx?.membership || !!ctx?.isSuperAdmin;
   if (event.visibility === "private" && !isMember && !canSeeDrafts(viewer)) {
      throw new NotFoundError("Event not found");
   }

   // The detail page shows more than a list row does: who set it up, and how long the
   // queue is. Both cost a lookup, so they're filled in here and nowhere else.
   const [mine, organiser, waitlistedCount] = await Promise.all([
      viewerRegistrationMap(req.user._id, [event._id]),
      event.createdBy
         ? User.findById(event.createdBy).select("name").lean()
         : null,
      EventRegistration.countDocuments({
         eventId: event._id,
         status: "waitlisted",
      }),
   ]);

   return successResponse(res, 200, "Event", {
      event: {
         ...publicEvent(event, {
            club,
            viewerStatus: mine.get(String(event._id)),
         }),
         organiser: organiser?.name || null,
         waitlistedCount,
      },
      viewer,
   });
}

// POST /api/clubs/:slug/events — create a draft, or publish straight away.
async function createEvent(req, res) {
   const club = req.club; // resolved + events:create asserted by requireClubPermission
   const { publish, ...fields } = req.body;
   // Skipping the draft step is still publishing — it needs the publish permission too.
   if (publish && !contextCan(req.clubContext, "events:publish")) {
      throw new ForbiddenError("You don't have permission to publish events");
   }
   assertCanBePublic(club, fields.visibility);

   const event = await Event.create({
      ...fields,
      clubId: club._id,
      createdBy: req.user._id,
      status: publish ? "published" : "draft",
   });
   if (publish) await countPublishedEvent(club._id);

   return successResponse(
      res,
      201,
      publish ? "Event published" : "Event saved as draft",
      { event: publicEvent(event, { club }) },
   );
}

// PATCH /api/clubs/:slug/events/:eventId — edit an event that isn't cancelled.
async function updateEvent(req, res) {
   const club = req.club; // resolved + events:edit asserted by requireClubPermission
   const event = await findClubEvent(club._id, req.params.eventId);

   if (event.status === "cancelled") {
      throw new ConflictError("A cancelled event can't be edited");
   }
   // Once it's over it's a record, not a plan.
   if (event.endAt < new Date()) {
      throw new ConflictError("A past event can't be edited");
   }

   // Capacity can't drop below the seats already taken.
   const { capacity } = req.body;
   if (capacity !== undefined && capacity !== 0) {
      const taken = event.stats?.registered || 0;
      if (capacity < taken) {
         throw new ConflictError(
            `${taken} people are already registered — capacity can't go below that`,
         );
      }
   }

   if (req.body.visibility) assertCanBePublic(club, req.body.visibility);

   const prevCapacity = event.capacity || 0;
   const prevStartAt = event.startAt;
   const prevDeadline = event.registrationDeadline;
   Object.assign(event, req.body);

   // An event that has started but not finished is still editable, so the future-date
   // rule applies only to a date that actually changed — unlike on create, where every
   // date is new.
   const now = new Date();
   const startChanged =
      req.body.startAt !== undefined &&
      new Date(req.body.startAt).getTime() !== new Date(prevStartAt).getTime();
   if (startChanged && event.startAt <= now) {
      throw new ValidationError("Start time must be in the future");
   }
   // Clearing it is always allowed; only a new date has to be in the future.
   const deadlineChanged =
      req.body.registrationDeadline != null &&
      new Date(req.body.registrationDeadline).getTime() !==
         (prevDeadline ? new Date(prevDeadline).getTime() : null);
   if (deadlineChanged && event.registrationDeadline <= now) {
      throw new ValidationError("Registration deadline must be in the future");
   }

   // The schema can't compare a pair when a patch sends only one half of it, so the
   // ordering rules are re-checked here against the merged document.
   if (event.endAt <= event.startAt) {
      throw new ValidationError("End time must be after the start time");
   }
   if (event.registrationDeadline && event.registrationDeadline > event.startAt) {
      throw new ValidationError(
         "Registration deadline must be on or before the start time",
      );
   }

   await event.save();

   // Freeing seats has to pull people off the waitlist — otherwise raising the cap
   // leaves them stuck there until somebody cancels.
   let promoted = [];
   let fresh = event;
   const capacityRaised =
      capacity !== undefined &&
      (event.capacity === 0 || event.capacity > prevCapacity);
   if (capacityRaised) {
      const slots =
         event.capacity === 0
            ? await EventRegistration.countDocuments({
                 eventId: event._id,
                 status: "waitlisted",
              })
            : Math.max(0, event.capacity - (event.stats?.registered || 0));
      promoted = await promoteWaitlisted(event._id, slots);
      // Re-read so the response carries the seat count the promotion just changed.
      if (promoted.length > 0) fresh = await Event.findById(event._id).lean();
   }

   return successResponse(res, 200, "Event updated", {
      event: publicEvent(fresh, { club }),
      promotedCount: promoted.length,
   });
}

// PATCH /api/clubs/:slug/events/:eventId/status — publish a draft or cancel an event.
async function setEventStatus(req, res) {
   // requireStatusPermission asserted events:publish or events:cancel to match req.body.status.
   const club = req.club;
   const event = await findClubEvent(club._id, req.params.eventId);
   const { status } = req.body;

   if (status === event.status) {
      throw new ConflictError(`This event is already ${status}`);
   }
   if (event.endAt < new Date()) {
      throw new ConflictError(
         status === "published"
            ? "This event has already ended"
            : "A past event can't be cancelled",
      );
   }
   if (status === "published" && event.status !== "draft") {
      throw new ConflictError("Only a draft can be published");
   }

   // Cancelling keeps the event and its registrations — the roster is the record of who
   // had signed up, and members need to see that it was called off.
   event.status = status;
   await event.save();
   if (status === "published") await countPublishedEvent(club._id);

   return successResponse(
      res,
      200,
      status === "published" ? "Event published" : "Event cancelled",
      { event: publicEvent(event, { club }) },
   );
}

// DELETE /api/clubs/:slug/events/:eventId — drafts only; a live event is cancelled instead.
async function deleteEvent(req, res) {
   const club = req.club; // resolved + events:cancel asserted by requireClubPermission
   const event = await findClubEvent(club._id, req.params.eventId);

   if (event.status !== "draft") {
      throw new ConflictError(
         "Only a draft can be deleted — cancel the event instead",
      );
   }

   await EventRegistration.deleteMany({ eventId: event._id });
   await Event.deleteOne({ _id: event._id });

   return successResponse(res, 200, "Event deleted", { id: event._id });
}

module.exports = {
   listClubEvents,
   listPublicEvents,
   getEvent,
   createEvent,
   updateEvent,
   setEventStatus,
   deleteEvent,
};
