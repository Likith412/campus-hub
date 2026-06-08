// Admin clubs controller — superAdmin-only institute-wide club listing.
const { successResponse } = require("../../utils/response");
const { ClubMembership, Club } = require("../../models");
const { escapeRegex } = require("./helpers");

// Sort options for the All Clubs table.
const CLUB_SORT = {
   popular: { "stats.memberCount": -1, createdAt: -1 },
   new: { createdAt: -1 },
   name: { name: 1 },
};

// GET /api/admin/clubs — every club across the institute (any status), with each club's
// coordinator(s) and member count, plus a status breakdown. superAdmin-only.
async function listAllClubs(req, res) {
   const { q, category, status, sort, page, limit } = req.validatedQuery;

   const filter = {};
   if (status) filter.status = status;
   if (category) filter.category = category;
   if (q) {
      const rx = { $regex: escapeRegex(q), $options: "i" };
      filter.$or = [{ name: rx }, { tagline: rx }, { tags: rx }];
   }

   const skip = (page - 1) * limit;
   const [items, total, statusAgg] = await Promise.all([
      Club.find(filter)
         .select(
            "slug name tagline category verified status logoUrl coverFrom coverTo stats.memberCount",
         )
         .sort(CLUB_SORT[sort] || CLUB_SORT.popular)
         .skip(skip)
         .limit(limit)
         .lean(),
      Club.countDocuments(filter),
      Club.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
   ]);

   // Coordinator name(s) per club for the page. "coordinator" is a per-club ClubRole, so
   // join clubroles (match slug) and users to collect each club's coordinator names.
   const coordsByClub = new Map();
   if (items.length) {
      const rows = await ClubMembership.aggregate([
         {
            $match: {
               clubId: { $in: items.map((c) => c._id) },
               status: "approved",
            },
         },
         {
            $lookup: {
               from: "clubroles",
               localField: "roleId",
               foreignField: "_id",
               as: "r",
            },
         },
         { $unwind: "$r" },
         { $match: { "r.slug": "coordinator" } },
         {
            $lookup: {
               from: "users",
               localField: "userId",
               foreignField: "_id",
               as: "u",
            },
         },
         { $unwind: "$u" },
         { $project: { clubId: 1, name: "$u.name" } },
      ]);
      for (const r of rows) {
         if (!r.name) continue;
         const key = String(r.clubId);
         coordsByClub.set(key, [...(coordsByClub.get(key) || []), r.name]);
      }
   }

   // Status breakdown (across all clubs, ignoring filters) for the headline cards.
   const counts = { total: 0, active: 0, suspended: 0, archived: 0 };
   for (const row of statusAgg) {
      counts.total += row.n;
      if (counts[row._id] !== undefined) counts[row._id] = row.n;
   }

   const shaped = items.map((c) => ({
      id: c._id,
      slug: c.slug,
      name: c.name,
      tagline: c.tagline,
      category: c.category,
      verified: !!c.verified,
      status: c.status,
      logoUrl: c.logoUrl,
      coverFrom: c.coverFrom,
      coverTo: c.coverTo,
      memberCount: c.stats?.memberCount ?? 0,
      coordinators: coordsByClub.get(String(c._id)) || [],
   }));

   return successResponse(res, 200, "Clubs", {
      items: shaped,
      counts,
      pagination: { page, limit, total, hasMore: skip + items.length < total },
   });
}

module.exports = { listAllClubs };
