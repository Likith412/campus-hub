// Admin events controller — superAdmin-only institute-wide event listing.
// Unlike GET /api/events (the student feed) this shows every status, including drafts
// and cancelled events, across every club whatever its status.
const { successResponse, pageMeta } = require("../../utils/response");
const { Event } = require("../../models");
const { escapeRegex } = require("../../utils/escapeRegex");
const {
   EVENT_SORT,
   eventCapabilities,
   publicEvent,
} = require("../events/helpers");

// GET /api/admin/events — every event across the institute, with its host club and a
// status breakdown for the filter chips. superAdmin-only.
async function listAllEvents(req, res) {
   const { q, club, type, status, when, sort, page, limit } = req.validatedQuery;

   const match = {};
   if (type) match.eventType = type;
   if (status) match.status = status;
   if (q) {
      const rx = { $regex: escapeRegex(q), $options: "i" };
      match.$or = [{ title: rx }, { tags: rx }];
   }
   const now = new Date();
   if (when === "upcoming") match.endAt = { $gte: now };
   else if (when === "past") match.endAt = { $lt: now };

   const skip = (page - 1) * limit;

   const [agg, statusAgg] = await Promise.all([
      Event.aggregate([
         { $match: match },
         {
            $lookup: {
               from: "clubs",
               localField: "clubId",
               foreignField: "_id",
               as: "club",
            },
         },
         { $unwind: { path: "$club", preserveNullAndEmptyArrays: true } },
         // Club filtering is by slug, so it has to happen after the join.
         ...(club ? [{ $match: { "club.slug": club } }] : []),
         // Cut both documents down to the row shape before sorting a whole collection
         // of them. createdAt and stats.registered stay because EVENT_SORT orders on
         // them; publicEvent's list branch reads nothing else.
         {
            $project: {
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
               createdAt: 1,
               "club.name": 1,
               "club.slug": 1,
            },
         },
         {
            $facet: {
               rows: [
                  { $sort: EVENT_SORT[sort] || EVENT_SORT.soonest },
                  { $skip: skip },
                  { $limit: limit },
               ],
               total: [{ $count: "n" }],
            },
         },
      ]),
      Event.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
   ]);

   const rows = agg[0]?.rows || [];
   const total = agg[0]?.total?.[0]?.n || 0;
   const can = await eventCapabilities(
      req.user,
      rows.map((e) => e.clubId),
   );

   return successResponse(res, 200, "Events", {
      // A superAdmin holds every permission in every club, so this is uniform here —
      // still resolved through the same helper rather than assumed.
      items: rows.map((e) =>
         publicEvent(e, { club: e.club, can: can.get(String(e.clubId)) }),
      ),
      statusCounts: Object.fromEntries(statusAgg.map((s) => [s._id, s.n])),
      pagination: pageMeta(page, limit, total, rows.length),
   });
}

module.exports = { listAllEvents };
