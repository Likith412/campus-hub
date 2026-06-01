// Clubs controller — browse, join, leave. Membership lifecycle: open=instant approved, request=pending, invite=admin-driven.
const { successResponse } = require("../utils/response");
const {
   NotFoundError,
   ForbiddenError,
   ConflictError,
} = require("../utils/errors");
const { Club, ClubMembership, User } = require("../models");
const { ROLE_WEIGHT } = require("../models/ClubMembership");
const { ROLES } = require("../constants/roles");

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
      verified: !!c.verified,
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
      roleWeight: ROLE_WEIGHT.member,
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

// GET /api/clubs/:slug — public detail with current user's membership state inlined.
async function getClub(req, res) {
   const club = await findActiveClubBySlug(req.params.slug);
   const userId = req.user?._id;

   let membership = null;
   if (userId) {
      membership = await ClubMembership.findOne({ userId, clubId: club._id })
         .select("status role joinedAt engagementScore")
         .lean();
   }

   return successResponse(res, 200, "Club", {
      id: club._id,
      slug: club.slug,
      name: club.name,
      category: club.category,
      description: club.description,
      logoUrl: club.logoUrl,
      bannerUrl: club.bannerUrl,
      coverFrom: club.coverFrom,
      coverTo: club.coverTo,
      foundedYear: club.foundedYear,
      tags: club.tags || [],
      socialLinks: club.socialLinks || {},
      memberCount: club.stats?.memberCount ?? 0,
      eventCount: club.stats?.eventCount ?? 0,
      totalEngagement: club.stats?.totalEngagement ?? 0,
      joinPolicy: club.settings?.joinPolicy || "request",
      isPrivate: !!club.settings?.isPrivate,
      membership: membership
         ? {
              status: membership.status,
              role: membership.role,
              joinedAt: membership.joinedAt,
              engagementScore: membership.engagementScore,
           }
         : null,
   });
}

// Returns the requester's membership doc if they're a club admin (or null if superAdmin → bypass).
async function assertClubAdmin(user, clubId) {
   if (user.role === ROLES.SUPER_ADMIN) return null;
   const m = await ClubMembership.findOne({
      userId: user._id,
      clubId,
      status: "approved",
      role: "clubAdmin",
   }).lean();
   if (!m) throw new ForbiddenError("Club admin access required");
   return m;
}

function publicMemberRow(m) {
   const u = m.userId || {};
   return {
      userId: u._id || null,
      name: u.name || "Unknown",
      avatarUrl: u.avatarUrl || null,
      department: u.profile?.department || null,
      year: u.profile?.year || null,
      role: m.role,
      status: m.status,
      engagementScore: m.engagementScore || 0,
      joinedAt: m.joinedAt || null,
      createdAt: m.createdAt,
   };
}

// GET /api/clubs/:slug/members — paginated, filterable by role/status. Pending list is admin-only.
async function listMembers(req, res) {
   const { q, role, status, page, limit } = req.validatedQuery;
   const club = await findActiveClubBySlug(req.params.slug);

   // Non-approved listings (pending/rejected/left) require club admin.
   const viewerIsAdmin =
      req.user.role === ROLES.SUPER_ADMIN ||
      !!(await ClubMembership.findOne({
         userId: req.user._id,
         clubId: club._id,
         status: "approved",
         role: "clubAdmin",
      }).lean());
   if (status !== "approved" && !viewerIsAdmin) {
      throw new ForbiddenError("Club admin access required");
   }

   const filter = { clubId: club._id, status, ...(role ? { role } : {}) };

   const skip = (page - 1) * limit;
   // Approved → sort by role weight then engagement; pending → oldest first (queue).
   const sort =
      status === "approved"
         ? { roleWeight: -1, engagementScore: -1, joinedAt: 1 }
         : { createdAt: 1 };

   let userMatch = null;
   if (q) {
      const matched = await User.find({
         name: { $regex: escapeRegex(q), $options: "i" },
      })
         .select("_id")
         .lean();
      userMatch = matched.map((u) => u._id);
      if (userMatch.length === 0) {
         return successResponse(res, 200, "Members", {
            items: [],
            viewerIsAdmin,
            pagination: { page, limit, total: 0, hasMore: false },
         });
      }
      filter.userId = { $in: userMatch };
   }

   const [rows, total] = await Promise.all([
      ClubMembership.find(filter)
         .sort(sort)
         .skip(skip)
         .limit(limit)
         .populate({
            path: "userId",
            select: "name avatarUrl profile.department profile.year",
         })
         .lean(),
      ClubMembership.countDocuments(filter),
   ]);

   return successResponse(res, 200, "Members", {
      items: rows.map(publicMemberRow),
      viewerIsAdmin,
      pagination: { page, limit, total, hasMore: skip + rows.length < total },
   });
}

// PATCH /api/clubs/:slug/members/:userId — change role and/or accept/reject pending.
async function updateMember(req, res) {
   const { role, status } = req.body;
   const club = await findActiveClubBySlug(req.params.slug);
   await assertClubAdmin(req.user, club._id);

   const m = await ClubMembership.findOne({
      clubId: club._id,
      userId: req.params.userId,
   });
   if (!m) throw new NotFoundError("Membership not found");

   // status changes only apply to pending memberships
   if (status) {
      if (m.status !== "pending") {
         throw new ConflictError("Membership is not pending");
      }
      m.status = status;
      if (status === "approved") {
         m.joinedAt = new Date();
         m.leftAt = null;
      }
   }

   // role changes only apply to approved memberships
   if (role) {
      const targetStatus = status === "approved" ? "approved" : m.status;
      if (targetStatus !== "approved") {
         throw new ConflictError("Can only set role on approved members");
      }
      // The `clubAdmin` system role is assignable only by superAdmin (faculty assignment lives in 1c).
      // A per-club clubAdmin can demote to `member` but can't mint new clubAdmins.
      if (role === "clubAdmin" && req.user.role !== ROLES.SUPER_ADMIN) {
         throw new ForbiddenError(
            "Only a super admin can assign the clubAdmin role",
         );
      }
      m.role = role;
   }

   await m.save();

   if (status === "approved") {
      await Club.updateOne(
         { _id: club._id },
         { $inc: { "stats.memberCount": 1 } },
      );
   }

   return successResponse(res, 200, "Member updated", {
      status: m.status,
      role: m.role,
   });
}

// DELETE /api/clubs/:slug/members/:userId — admin removes a member (terminal state: left).
async function removeMember(req, res) {
   const club = await findActiveClubBySlug(req.params.slug);
   await assertClubAdmin(req.user, club._id);

   // Don't let an admin remove themselves via this endpoint — they should use leaveClub.
   if (String(req.user._id) === String(req.params.userId)) {
      throw new ConflictError("Use leave to remove your own membership");
   }

   const m = await ClubMembership.findOne({
      clubId: club._id,
      userId: req.params.userId,
   });
   if (!m || m.status === "left" || m.status === "rejected") {
      throw new NotFoundError("No active membership");
   }

   const wasApproved = m.status === "approved";
   m.status = "left";
   m.leftAt = new Date();
   await m.save();

   if (wasApproved) {
      await Club.updateOne(
         { _id: club._id, "stats.memberCount": { $gt: 0 } },
         { $inc: { "stats.memberCount": -1 } },
      );
   }

   return successResponse(res, 200, "Member removed", { status: "left" });
}

module.exports = {
   listClubs,
   getClub,
   joinClub,
   leaveClub,
   listMembers,
   updateMember,
   removeMember,
};
