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
const {
   Club,
   ClubMembership,
   Event,
   EventRegistration,
   User,
} = require("../../models");
const { escapeRegex } = require("../../utils/escapeRegex");
const { ROLES } = require("../../constants/roles");
const {
   sendRegistrationRevokedEmail,
   sendEventCancelledEmails,
} = require("../../services/emailService");
const {
   findClubBySlugFor,
   resolveClubContext,
   contextCan,
} = require("../clubs/helpers");
const {
   EVENT_ROW_FIELDS,
   EVENT_SORT,
   eventCapabilities,
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
      Event.find(match).select(EVENT_ROW_FIELDS).sort(order).skip(skip).limit(limit).lean(),
      Event.countDocuments(match),
   ]);

   const mine = await viewerRegistrationMap(
      req.user._id,
      rows.map((r) => r._id),
   );

   // One club, so the page-level viewer already answers this — mirrored onto each row
   // so the card reads the same field wherever it renders.
   const rowCan = {
      canEdit: viewer.canEdit,
      canPublish: viewer.canPublish,
      canCancel: viewer.canCancel,
   };

   return successResponse(res, 200, "Events", {
      items: rows.map((e) =>
         publicEvent(e, {
            club,
            viewerStatus: mine.get(String(e._id)),
            can: rowCan,
         }),
      ),
      viewer,
      pagination: pageMeta(page, limit, total, rows.length),
   });
}

// GET /api/events — cross-club browse. Published events in active clubs only.
async function listPublicEvents(req, res) {
   const { q, type, clubs, openOnly, when, sort, page, limit } =
      req.validatedQuery;
   const now = new Date();
   const skip = (page - 1) * limit;

   const match = {
      status: "published",
      endAt: when === "past" ? { $lt: now } : { $gte: now },
   };

   // Both the visibility rule and the club filter turn on the same fact — which clubs
   // you belong to — so it's fetched once here rather than per filter.
   const [taken, mine] = await Promise.all([
      EventRegistration.find({
         userId: req.user._id,
         status: { $in: LIVE_REGISTRATION_STATUSES },
      })
         .select("eventId")
         .lean(),
      ClubMembership.find({ userId: req.user._id, status: "approved" })
         .select("clubId")
         .lean(),
   ]);
   const takenIds = taken.map((r) => r.eventId);
   const myClubIds = mine.map((m) => m.clubId);

   // Clubs whose events you may edit or cancel. An event you run has to reach you even
   // when it's full or past its deadline — those are exactly the ones you'd act on.
   const myCaps = await eventCapabilities(req.user, myClubIds);
   const manageableClubIds = myClubIds.filter((id) => {
      const c = myCaps.get(String(id));
      return c?.canEdit || c?.canCancel;
   });

   if (type) match.eventType = type;

   const and = [];
   // Anything you already hold a seat or a waitlist place on drops out — your own list
   // lives on /my-events. Events you run are the exception: an organiser who also
   // registered still needs to reach them from here.
   if (takenIds.length) {
      and.push(
         manageableClubIds.length
            ? {
                 $or: [
                    { _id: { $nin: takenIds } },
                    { clubId: { $in: manageableClubIds } },
                 ],
              }
            : { _id: { $nin: takenIds } },
      );
   }
   // Public events, plus the members-only ones from clubs you've joined — the same
   // entitlement the register endpoint enforces. Without this the feed gets *less*
   // useful the more clubs you're in.
   and.push(
      myClubIds.length
         ? {
              $or: [
                 { visibility: "public" },
                 { visibility: "private", clubId: { $in: myClubIds } },
              ],
           }
         : { visibility: "public" },
   );
   if (q) {
      const rx = { $regex: escapeRegex(q), $options: "i" };
      and.push({ $or: [{ title: rx }, { tags: rx }] });
   }
   // Your own clubs' events aren't a discovery — you see them on the club page.
   if (clubs === "not-mine" && myClubIds.length) {
      and.push({ clubId: { $nin: myClubIds } });
   }
   // Only what you could still act on. Never applied to the past tab, where every
   // registration window has closed by definition.
   if (openOnly === "true" && when !== "past") {
      const stillOpen = {
         $and: [
            // Registration still open: the deadline if the event sets one, else the start.
            {
               $expr: {
                  $gte: [{ $ifNull: ["$registrationDeadline", "$startAt"] }, now],
               },
            },
            // And there's something to take: an uncapped event, a free seat, or a queue.
            {
               $or: [
                  { capacity: { $in: [0, null] } },
                  { waitlistEnabled: true },
                  { $expr: { $lt: ["$stats.registered", "$capacity"] } },
               ],
            },
         ],
      };
      // "Nothing left to take" is about registering. It doesn't apply to an event you
      // run — you're there to manage it, not to claim a seat.
      and.push(
         manageableClubIds.length
            ? { $or: [stillOpen, { clubId: { $in: manageableClubIds } }] }
            : stillOpen,
      );
   }
   if (and.length) match.$and = and;

   const [agg] = await Event.aggregate([
      { $match: match },
      // Join the host club so suspended/archived clubs drop out of the feed. The
      // sub-pipeline keeps only what eventClub() reads, plus the status this filters on.
      {
         $lookup: {
            from: "clubs",
            localField: "clubId",
            foreignField: "_id",
            as: "club",
            // A feed card prints the club's name; `status` is what the filter below
            // reads. Nothing else on a row touches the club.
            pipeline: [{ $project: { name: 1, slug: 1, status: 1 } }],
         },
      },
      { $unwind: "$club" },
      { $match: { "club.status": "active" } },
      // "filling" needs a ratio the documents don't store. Uncapped events get -1 so
      // they rank below every capped one rather than reading as empty.
      ...(sort === "filling"
         ? [
              {
                 $addFields: {
                    fillRatio: {
                       $cond: [
                          { $gt: ["$capacity", 0] },
                          {
                             $divide: [
                                { $ifNull: ["$stats.registered", 0] },
                                "$capacity",
                             ],
                          },
                          -1,
                       ],
                    },
                 },
              },
           ]
         : []),
      {
         $facet: {
            rows: [
               {
                  $sort:
                     sort === "filling"
                        ? { fillRatio: -1, startAt: 1 }
                        : EVENT_SORT[sort] ||
                          (when === "past"
                             ? EVENT_SORT.latest
                             : EVENT_SORT.soonest),
               },
               { $skip: skip },
               { $limit: limit },
               // Trim after sorting — the sort still ran on the full documents.
               {
                  $project: {
                     // Not on the wire — publicEvent drops it — but eventCapabilities
                     // keys on it to work out what the viewer may do with each row.
                     clubId: 1,
                     title: 1,
                     eventType: 1,
                     status: 1,
                     visibility: 1,
                     startAt: 1,
                     endAt: 1,
                     registrationDeadline: 1,
                     waitlistEnabled: 1,
                     "venue.type": 1,
                     "venue.location": 1,
                     capacity: 1,
                     "stats.registered": 1,
                     club: 1,
                  },
               },
            ],
            total: [{ $count: "n" }],
         },
      },
   ]);

   const rows = agg?.rows || [];
   const total = agg?.total?.[0]?.n || 0;
   const [can, viewerStatuses] = await Promise.all([
      eventCapabilities(
         req.user,
         rows.map((e) => e.clubId),
      ),
      // The "already taken" exclusion is no longer total: events from clubs the viewer
      // manages are deliberately re-admitted above so an organiser can act on their own
      // event from here. Those rows CAN be ones the viewer holds a seat on, so their
      // standing has to be resolved — without it the card offers "Register" for a seat
      // they already hold.
      viewerRegistrationMap(
         req.user._id,
         rows.map((e) => e._id),
      ),
   ]);

   return successResponse(res, 200, "Events", {
      items: rows.map((e) =>
         publicEvent(e, {
            club: e.club,
            viewerStatus: viewerStatuses.get(String(e._id)),
            can: can.get(String(e.clubId)),
         }),
      ),
      pagination: pageMeta(page, limit, total, rows.length),
   });
}

// GET /api/events/:eventId — one event, with the caller's own registration status.
async function getEvent(req, res) {
   const event = await Event.findById(req.params.eventId).lean();
   if (!event) throw new NotFoundError("Event not found");

   // Exactly what the status gate below and eventClub(club, true) read.
   const club = await Club.findById(event.clubId)
      .select("name slug status verified coverFrom coverTo")
      .lean();
   if (!club) throw new NotFoundError("Event not found");
   // Same rule as findClubBySlugFor — a suspended club's events are superAdmin-only —
   // applied to the club already loaded rather than fetching it a second time.
   if (club.status !== "active" && req.user.role !== ROLES.SUPER_ADMIN) {
      throw new NotFoundError("Event not found");
   }

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
            full: true,
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

// Live registrations (registered or waitlisted) held by people outside the club, for
// an event that's dropping to members-only. Split out from evictOutsiders so the
// capacity guard can see this count *before* eviction runs — a capacity edit made in
// the same request has to be checked against what registered will be once these seats
// are freed, not the number still on record before that happens.
async function outsiderRegistrations(eventId, clubId) {
   const live = await EventRegistration.find({
      eventId,
      status: { $in: LIVE_REGISTRATION_STATUSES },
   })
      .select("userId status")
      .lean();
   if (live.length === 0) return [];

   const members = await ClubMembership.find({
      clubId,
      userId: { $in: live.map((r) => r.userId) },
      status: "approved",
   })
      .select("userId")
      .lean();
   const memberIds = new Set(members.map((m) => String(m.userId)));
   return live.filter((r) => !memberIds.has(String(r.userId)));
}

// An event that turns members-only can't keep the outsiders who signed up while it was
// public. Their rows are cancelled, the seat count is settled, and members waiting in
// the queue take the freed seats. Returns both who was revoked (for the email below)
// and who was promoted (so the caller's promotedCount doesn't silently drop them).
async function evictOutsiders(event, club, outsiders) {
   if (outsiders.length === 0) return { evicted: [], promoted: [] };

   // Re-check status right before mutating: `outsiders` was resolved earlier in the
   // request — ahead of the capacity/date validation and event.save() — so there's a
   // real window for one of these people to have cancelled their own seat in the
   // meantime. Trusting that stale snapshot's status here would double-decrement
   // stats.registered for a seat that was already given back.
   const live = await EventRegistration.find({
      _id: { $in: outsiders.map((r) => r._id) },
      status: { $in: LIVE_REGISTRATION_STATUSES },
   })
      .select("userId status")
      .lean();
   if (live.length === 0) return { evicted: [], promoted: [] };

   // Only confirmed seats free anything up; a waitlisted row was never holding one.
   // Guard the write on the status too, and count seats from what actually moved: the
   // `live` read above is still a snapshot, and someone cancelling their own seat in
   // that last window would otherwise be counted a second time here.
   const ids = live.map((r) => r._id);
   const cancelledAt = new Date();
   const seated = await EventRegistration.updateMany(
      { _id: { $in: ids }, status: "registered" },
      { $set: { status: "cancelled", cancelledAt } },
   );
   await EventRegistration.updateMany(
      { _id: { $in: ids }, status: "waitlisted" },
      { $set: { status: "cancelled", cancelledAt } },
   );
   const seatsFreed = seated.modifiedCount;
   let promoted = [];
   if (seatsFreed > 0) {
      await Event.updateOne(
         { _id: event._id },
         { $inc: { "stats.registered": -seatsFreed } },
      );
      promoted = await promoteWaitlisted(event._id, seatsFreed);
   }

   // Told, never blocking: a mail failure must not undo the visibility change.
   try {
      const people = await User.find({
         _id: { $in: live.map((r) => r.userId) },
      })
         .select("name email")
         .lean();
      await Promise.all(
         people.map((u) =>
            sendRegistrationRevokedEmail(u.email, {
               name: u.name,
               clubName: club.name,
               eventTitle: event.title,
            }),
         ),
      );
   } catch (err) {
      console.error("[events] revocation notice failed:", err.message);
   }

   return { evicted: live, promoted };
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

   if (req.body.visibility) assertCanBePublic(club, req.body.visibility);

   // A visibility drop in this same request will evict any outsiders below — computed
   // once, up front, so the capacity guard can judge the count it actually produces
   // instead of the stale one on record before eviction runs.
   const droppingToMembersOnly =
      event.visibility === "public" && req.body.visibility === "private";
   const outsiders = droppingToMembersOnly
      ? await outsiderRegistrations(event._id, club._id)
      : [];

   // Capacity can't drop below the seats that will actually still be taken.
   const { capacity } = req.body;
   if (capacity !== undefined && capacity !== 0) {
      let taken = event.stats?.registered || 0;
      if (droppingToMembersOnly) {
         taken -= outsiders.filter((r) => r.status === "registered").length;
      }
      if (capacity < taken) {
         throw new ConflictError(
            `${taken} people are already registered — capacity can't go below that`,
         );
      }
   }

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

   // Going members-only revokes the seats of anyone outside the club. They took those
   // seats legitimately while it was public, so they're told — silently dropping someone
   // means they turn up to an event they still believe they're on.
   let evicted = [];
   let promoted = [];
   if (droppingToMembersOnly) {
      const result = await evictOutsiders(event, club, outsiders);
      evicted = result.evicted;
      promoted = result.promoted;
   }

   // Freeing seats has to pull people off the waitlist — otherwise raising the cap
   // leaves them stuck there until somebody cancels. Reload first: eviction's seat-count
   // decrement (and its own promotions, folded in above) happened via separate writes
   // that never touched this in-memory document, so `event.stats.registered` here would
   // still read the pre-eviction number.
   let fresh = evicted.length > 0 ? await Event.findById(event._id) : event;
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
            : Math.max(0, event.capacity - (fresh.stats?.registered || 0));
      const morePromoted = await promoteWaitlisted(event._id, slots);
      promoted = promoted.concat(morePromoted);
      // Re-read so the response carries the seat count the promotion just changed.
      if (morePromoted.length > 0) fresh = await Event.findById(event._id).lean();
   }

   return successResponse(res, 200, "Event updated", {
      event: publicEvent(fresh, { club }),
      promotedCount: promoted.length,
      revokedCount: evicted.length,
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

   // Told, never blocking: a mail failure must not undo the cancellation.
   if (status === "cancelled") {
      try {
         const holders = await EventRegistration.find({
            eventId: event._id,
            status: { $in: LIVE_REGISTRATION_STATUSES },
         })
            .select("userId")
            .lean();
         const people = holders.length
            ? await User.find({
                 _id: { $in: holders.map((r) => r.userId) },
                 isActive: true,
                 deletedAt: null,
              })
                 .select("email name")
                 .lean()
            : [];
         if (people.length) {
            await sendEventCancelledEmails(people, {
               clubName: club.name,
               eventTitle: event.title,
               when: new Date(event.startAt).toLocaleString("en-IN", {
                  dateStyle: "medium",
                  timeStyle: "short",
               }),
            });
         }
      } catch (err) {
         console.error("[events] cancellation notice failed:", err.message);
      }
   }

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
