// Clubs controller — browse, join, leave. Membership lifecycle: open=instant approved, request=pending, invite=admin-driven.
const { successResponse } = require("../utils/response");
const {
   NotFoundError,
   ForbiddenError,
   ConflictError,
} = require("../utils/errors");
const { Club, ClubMembership } = require("../models");

// Escape user input before dropping into a RegExp.
function escapeRegex(s) {
   return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const SORT_MAP = {
   popular: { "stats.memberCount": -1, createdAt: -1 },
   new: { createdAt: -1 },
   active: { "stats.totalEngagement": -1, "stats.eventCount": -1 },
   name: { name: 1 },
};

// Shape a club doc for the listing card.
function publicClubCard(c, membershipByClubId) {
   const m = membershipByClubId?.get(String(c._id));
   return {
      id: c._id,
      slug: c.slug,
      name: c.name,
      category: c.category,
      description: c.description,
      logoUrl: c.logoUrl,
      bannerUrl: c.bannerUrl,
      coverFrom: c.coverFrom,
      coverTo: c.coverTo,
      foundedYear: c.foundedYear,
      tags: c.tags || [],
      memberCount: c.stats?.memberCount ?? 0,
      eventCount: c.stats?.eventCount ?? 0,
      joinPolicy: c.settings?.joinPolicy || "request",
      isPrivate: !!c.settings?.isPrivate,
      // membership state for the current user (drives the join button)
      membershipStatus: m?.status || null, // approved | pending | rejected | left | null
      membershipRole: m?.role || null,
   };
}

// GET /api/clubs — paginated list with category counts and per-user membership state.
async function listClubs(req, res) {
   const { q, category, sort, page, limit } = req.validatedQuery;
   const userId = req.user?._id;

   const baseFilter = { status: "active" };
   const searchFilter = q
      ? {
           $or: [
              { name: { $regex: escapeRegex(q), $options: "i" } },
              { description: { $regex: escapeRegex(q), $options: "i" } },
              { tags: { $regex: escapeRegex(q), $options: "i" } },
           ],
        }
      : {};

   const filter = {
      ...baseFilter,
      ...searchFilter,
      ...(category ? { category } : {}),
   };

   const skip = (page - 1) * limit;
   const [items, total, countsAgg] = await Promise.all([
      Club.find(filter)
         .sort(SORT_MAP[sort] || SORT_MAP.popular)
         .skip(skip)
         .limit(limit)
         .lean(),
      Club.countDocuments(filter),
      // counts ignore category filter (so chips still show full totals) but honor search
      Club.aggregate([
         { $match: { ...baseFilter, ...searchFilter } },
         { $group: { _id: "$category", n: { $sum: 1 } } },
      ]),
   ]);

   // Per-user membership status for the page of clubs.
   let membershipByClubId = new Map();
   if (userId && items.length) {
      const memberships = await ClubMembership.find({
         userId,
         clubId: { $in: items.map((i) => i._id) },
      })
         .select("clubId status role")
         .lean();
      membershipByClubId = new Map(
         memberships.map((m) => [String(m.clubId), m]),
      );
   }

   const categoryCounts = { all: 0 };
   for (const row of countsAgg) {
      categoryCounts[row._id] = row.n;
      categoryCounts.all += row.n;
   }

   return successResponse(res, 200, "Clubs", {
      items: items.map((c) => publicClubCard(c, membershipByClubId)),
      categoryCounts,
      pagination: {
         page,
         limit,
         total,
         hasMore: skip + items.length < total,
      },
   });
}

// Find an active club by slug or 404.
async function findActiveClubBySlug(slug) {
   const club = await Club.findOne({ slug, status: "active" });
   if (!club) throw new NotFoundError("Club not found");
   return club;
}

// POST /api/clubs/:slug/join — open=instant approved, request=pending, invite-only=forbidden.
async function joinClub(req, res) {
   const userId = req.user._id;
   const club = await findActiveClubBySlug(req.params.slug);

   const policy = club.settings?.joinPolicy || "request";
   if (policy === "invite-only") {
      throw new ForbiddenError("This club is invite-only");
   }

   const existing = await ClubMembership.findOne({ userId, clubId: club._id });
   if (
      existing &&
      (existing.status === "approved" || existing.status === "pending")
   ) {
      throw new ConflictError(
         existing.status === "approved"
            ? "You are already a member"
            : "Your request is pending",
      );
   }

   const nextStatus = policy === "open" ? "approved" : "pending";
   const update = {
      userId,
      clubId: club._id,
      role: "member",
      status: nextStatus,
      ...(nextStatus === "approved"
         ? { joinedAt: new Date(), leftAt: null }
         : {}),
   };

   await ClubMembership.findOneAndUpdate({ userId, clubId: club._id }, update, {
      upsert: true,
      setDefaultsOnInsert: true,
      returnDocument: "after",
   });

   // Only increment member count for instant approvals, not pending requests.
   if (nextStatus === "approved") {
      await Club.updateOne(
         { _id: club._id },
         { $inc: { "stats.memberCount": 1 } },
      );
   }

   return successResponse(res, 200, "Join processed", { status: nextStatus });
}

// DELETE /api/clubs/:slug/membership — leave the club (or cancel a pending request).
async function leaveClub(req, res) {
   const userId = req.user._id;
   const club = await findActiveClubBySlug(req.params.slug);

   const m = await ClubMembership.findOne({ userId, clubId: club._id });
   if (!m || m.status === "left" || m.status === "rejected") {
      throw new NotFoundError("No active membership");
   }

   const wasApproved = m.status === "approved";
   const wasPending = m.status === "pending";
   m.status = "left";
   m.leftAt = new Date();
   await m.save();

   if (wasApproved) {
      await Club.updateOne(
         { _id: club._id, "stats.memberCount": { $gt: 0 } },
         { $inc: { "stats.memberCount": -1 } },
      );
   }

   // "left" is the shared terminal state, but the message reflects what actually ended.
   const message = wasPending ? "Request cancelled" : "Left club";
   return successResponse(res, 200, message, { status: "left" });
}

module.exports = { listClubs, joinClub, leaveClub };
