// Admin events controller — superAdmin-only institute-wide event listing.
// Unlike GET /api/events (the student feed) this shows every status, including drafts
// and cancelled events, across every club whatever its status.
const { successResponse } = require("../../utils/response");
const { Event } = require("../../models");
const { escapeRegex } = require("./helpers");
const { EVENT_SORT, publicEvent } = require("../events/helpers");

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

   return successResponse(res, 200, "Events", {
      items: rows.map((e) => publicEvent(e, { club: e.club })),
      statusCounts: Object.fromEntries(statusAgg.map((s) => [s._id, s.n])),
      pagination: { page, limit, total, hasMore: skip + rows.length < total },
   });
}

module.exports = { listAllEvents };
