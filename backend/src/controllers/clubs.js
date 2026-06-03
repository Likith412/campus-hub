// Clubs controller — browse, join, leave. Membership lifecycle: open=instant approved, request=pending, invite=admin-driven.
const { successResponse } = require("../utils/response");
const {
   NotFoundError,
   ForbiddenError,
   ConflictError,
   ValidationError,
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
      tagline: c.tagline,
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
   const { q, category, sort, verified, page, limit } = req.validatedQuery;
   const userId = req.user?._id;

   const baseFilter = { status: "active" };
   if (verified === "true") baseFilter.verified = true;
   if (verified === "false") baseFilter.verified = false;
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

// Turn a name into a url-safe slug.
function slugify(s) {
   return s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
}

// Find an unused slug, appending -2, -3, … on collision.
async function uniqueSlug(base) {
   const root = slugify(base) || "club";
   let slug = root;
   for (let n = 2; await Club.exists({ slug }); n++) slug = `${root}-${n}`;
   return slug;
}

// POST /api/clubs — coordinator/superAdmin create a club; live immediately, unverified.
async function createClub(req, res) {
   const {
      name,
      category,
      tagline,
      description,
      tags,
      joinPolicy,
      isPrivate,
      socialLinks,
      coverFrom,
      coverTo,
      foundedYear,
   } = req.body;
   const isSuperAdmin = req.user.role === ROLES.SUPER_ADMIN;

   // Resolve who coordinates the new club:
   //  - coordinator creates → they are the sole coordinator (self-assigned).
   //  - superAdmin creates → must assign ≥1 active faculty (coordinator assignment is superAdmin-only).
   let coordinatorIds;
   if (isSuperAdmin) {
      const requested = [
         ...new Set((req.body.coordinatorIds || []).map(String)),
      ];
      if (requested.length === 0) {
         throw new ValidationError("Assign at least one coordinator");
      }
      const valid = await User.find({
         _id: { $in: requested },
         role: ROLES.COORDINATOR,
         isActive: true,
      })
         .select("_id")
         .lean();
      if (valid.length !== requested.length) {
         throw new ValidationError(
            "Coordinators must be active faculty accounts",
         );
      }
      coordinatorIds = valid.map((u) => u._id);
   } else {
      coordinatorIds = [req.user._id];
   }

   // slug is optional — fall back to the name, then de-duplicate on collision.
   const slug = await uniqueSlug(req.body.slug || name);

   const club = await Club.create({
      name,
      slug,
      category,
      tagline,
      description,
      tags: tags || [],
      socialLinks: socialLinks || {},
      coverFrom,
      coverTo,
      foundedYear,
      settings: { joinPolicy: joinPolicy || "request", isPrivate: !!isPrivate },
      status: "active",
      // superAdmin-created clubs are verified on the spot; faculty-created start unverified.
      verified: isSuperAdmin,
      createdBy: req.user._id,
      stats: { memberCount: coordinatorIds.length },
   });

   // Issue an approved coordinator membership for each assigned coordinator.
   const now = new Date();
   await ClubMembership.insertMany(
      coordinatorIds.map((userId) => ({
         userId,
         clubId: club._id,
         role: "coordinator",
         roleWeight: ROLE_WEIGHT.coordinator,
         status: "approved",
         joinedAt: now,
      })),
   );

   return successResponse(res, 201, "Club created", {
      slug: club.slug,
      verified: !!club.verified,
   });
}

// PATCH /api/clubs/:slug/verification — superAdmin flips the ✓ verified badge.
async function setVerification(req, res) {
   const club = await Club.findOne({ slug: req.params.slug });
   if (!club) throw new NotFoundError("Club not found");
   club.verified = req.body.verified;
   await club.save();
   return successResponse(res, 200, "Verification updated", {
      verified: club.verified,
   });
}

// PATCH /api/clubs/:slug/status — superAdmin suspends/archives/reactivates a club.
async function setStatus(req, res) {
   const club = await Club.findOne({ slug: req.params.slug });
   if (!club) throw new NotFoundError("Club not found");
   club.status = req.body.status;
   await club.save();
   return successResponse(res, 200, "Status updated", { status: club.status });
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
   // An admin-removed member can't re-join on their own — they must be re-invited.
   if (existing && existing.status === "removed") {
      throw new ForbiddenError(
         "You were removed from this club; an admin must re-invite you",
      );
   }

   const nextStatus = policy === "open" ? "approved" : "pending";
   const update = {
      userId,
      clubId: club._id,
      role: "member",
      roleWeight: ROLE_WEIGHT.member,
      status: nextStatus,
      // Clear any stale terminal-state fields from a prior membership on re-join.
      leftAt: null,
      removedBy: null,
      joinedAt: nextStatus === "approved" ? new Date() : null,
   };

   // returnDocument: "before" lets us see the prior status, so a concurrent
   // double-join only counts the write that actually flipped them to approved.
   const prev = await ClubMembership.findOneAndUpdate(
      { userId, clubId: club._id },
      update,
      { upsert: true, setDefaultsOnInsert: true, returnDocument: "before" },
   );

   // Only increment for instant approvals, and only if this write did the transition.
   if (nextStatus === "approved" && prev?.status !== "approved") {
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

   // Atomically flip an active membership to "left"; the filter only matches a
   // leave-able row, so a concurrent double-leave decrements the count at most once.
   const prev = await ClubMembership.findOneAndUpdate(
      { userId, clubId: club._id, status: { $in: ["approved", "pending"] } },
      // Voluntary leave — clear any stale admin-action audit pointer.
      { status: "left", leftAt: new Date(), removedBy: null },
      { returnDocument: "before" },
   );
   if (!prev) throw new NotFoundError("No active membership");

   const wasApproved = prev.status === "approved";
   const wasPending = prev.status === "pending";

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
      tagline: club.tagline,
      description: club.description,
      logoUrl: club.logoUrl,
      bannerUrl: club.bannerUrl,
      coverFrom: club.coverFrom,
      coverTo: club.coverTo,
      verified: !!club.verified,
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

// Returns the requester's membership doc if they're a coordinator (or null if superAdmin → bypass).
async function assertCoordinator(user, clubId) {
   if (user.role === ROLES.SUPER_ADMIN) return null;
   const m = await ClubMembership.findOne({
      userId: user._id,
      clubId,
      status: "approved",
      role: "coordinator",
   }).lean();
   if (!m) throw new ForbiddenError("Coordinator access required");
   return m;
}

function publicMemberRow(m) {
   const u = m.userId || {};
   // removedBy is populated by listMembers, so it's either a user doc or null.
   const rb = m.removedBy;
   const removedBy = rb?._id
      ? { userId: rb._id, name: rb.name || "Unknown" }
      : null;
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
      leftAt: m.leftAt || null,
      removedBy,
      createdAt: m.createdAt,
   };
}

// GET /api/clubs/:slug/members — paginated, filterable by role/status. Pending list is admin-only.
async function listMembers(req, res) {
   const { q, role, status, page, limit } = req.validatedQuery;
   const club = await findActiveClubBySlug(req.params.slug);

   // Non-approved listings (pending/rejected/left) require a coordinator.
   const viewerIsCoordinator =
      req.user.role === ROLES.SUPER_ADMIN ||
      !!(await ClubMembership.findOne({
         userId: req.user._id,
         clubId: club._id,
         status: "approved",
         role: "coordinator",
      }).lean());
   if (status !== "approved" && !viewerIsCoordinator) {
      throw new ForbiddenError("Coordinator access required");
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
            viewerIsCoordinator,
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
         .populate([
            {
               path: "userId",
               select: "name avatarUrl profile.department profile.year",
            },
            // Populate the acting admin so each removed row carries id + name.
            { path: "removedBy", select: "name" },
         ])
         .lean(),
      ClubMembership.countDocuments(filter),
   ]);

   return successResponse(res, 200, "Members", {
      items: rows.map(publicMemberRow),
      viewerIsCoordinator,
      pagination: { page, limit, total, hasMore: skip + rows.length < total },
   });
}

// PATCH /api/clubs/:slug/members/:userId — change role and/or accept/reject pending.
async function updateMember(req, res) {
   const { role, status } = req.body;
   const club = await findActiveClubBySlug(req.params.slug);
   await assertCoordinator(req.user, club._id);

   const m = await ClubMembership.findOne({
      clubId: club._id,
      userId: req.params.userId,
   });
   if (!m) throw new NotFoundError("Membership not found");

   // Validate the requested transition up-front so errors are precise.
   // Approving accepts a pending request OR re-invites an admin-removed member;
   // rejecting only applies to a pending request.
   if (status === "approved") {
      if (m.status !== "pending" && m.status !== "removed") {
         throw new ConflictError("Membership is not pending or removed");
      }
   } else if (status === "rejected") {
      if (m.status !== "pending") {
         throw new ConflictError("Membership is not pending");
      }
   }

   // role changes only apply to (newly-)approved memberships
   const willBeApproved =
      status === "approved" || (!status && m.status === "approved");
   if (role) {
      if (!willBeApproved) {
         throw new ConflictError("Can only set role on approved members");
      }
      // The `coordinator` role is assignable only by superAdmin (faculty assignment lives in 1c).
      // A per-club coordinator can demote to `member` but can't mint new coordinators.
      if (role === "coordinator" && req.user.role !== ROLES.SUPER_ADMIN) {
         throw new ForbiddenError(
            "Only a super admin can assign the coordinator role",
         );
      }
   }

   const set = {};
   if (status === "approved") {
      Object.assign(set, {
         status: "approved",
         joinedAt: new Date(),
         leftAt: null,
         removedBy: null,
      });
   } else if (status === "rejected") {
      set.status = "rejected";
   }
   if (role) {
      set.role = role;
      set.roleWeight = ROLE_WEIGHT[role]; // findOneAndUpdate skips the pre-save hook
   }

   // Guard the write on the pre-transition status so a concurrent approve counts once.
   const guard = { clubId: club._id, userId: req.params.userId };
   if (status === "approved") guard.status = { $in: ["pending", "removed"] };
   else if (status === "rejected") guard.status = "pending";

   const prev = await ClubMembership.findOneAndUpdate(guard, set, {
      returnDocument: "before",
   });

   // Only the write that actually performed the approve transition bumps the count.
   if (status === "approved" && prev) {
      await Club.updateOne(
         { _id: club._id },
         { $inc: { "stats.memberCount": 1 } },
      );
   }

   return successResponse(res, 200, "Member updated", {
      status: set.status || m.status,
      role: set.role || m.role,
   });
}

// DELETE /api/clubs/:slug/members/:userId — coordinator removes a member (terminal state: "removed".
async function removeMember(req, res) {
   const club = await findActiveClubBySlug(req.params.slug);
   await assertCoordinator(req.user, club._id);

   // Don't let a coordinator remove themselves via this endpoint — they should use leaveClub.
   if (String(req.user._id) === String(req.params.userId)) {
      throw new ConflictError("Use leave to remove your own membership");
   }

   // Atomically flip an active membership to "removed"; the filter only matches
   // an active row, so a concurrent double-remove decrements the count at most once.
   const prev = await ClubMembership.findOneAndUpdate(
      {
         clubId: club._id,
         userId: req.params.userId,
         status: { $in: ["approved", "pending"] },
      },
      { status: "removed", leftAt: new Date(), removedBy: req.user._id },
      { returnDocument: "before" },
   );
   if (!prev) throw new NotFoundError("No active membership");

   if (prev.status === "approved") {
      await Club.updateOne(
         { _id: club._id, "stats.memberCount": { $gt: 0 } },
         { $inc: { "stats.memberCount": -1 } },
      );
   }

   return successResponse(res, 200, "Member removed", { status: "removed" });
}

module.exports = {
   listClubs,
   getClub,
   createClub,
   setVerification,
   setStatus,
   joinClub,
   leaveClub,
   listMembers,
   updateMember,
   removeMember,
};
