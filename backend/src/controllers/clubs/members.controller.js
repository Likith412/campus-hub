// Club members controller — roster, moderation, role assignment, coordinator lifecycle.
const { successResponse, pageMeta } = require("../../utils/response");
const {
   NotFoundError,
   ForbiddenError,
   ConflictError,
} = require("../../utils/errors");
const { ClubMembership, ClubRole, User } = require("../../models");
const { ROLES } = require("../../constants/roles");
const { escapeRegex } = require("../../utils/escapeRegex");
const {
   assertCanGrant,
   bumpClubStat,
   findClubBySlugFor,
   ensureSystemRoles,
   systemRoleId,
   resolveClubContext,
   contextCan,
} = require("./helpers");
const { releaseSeats } = require("../events/helpers");

// Shape an aggregation row (user joined as `user`, role as `role`, admin as `removedByUser`).
// The roster itself — name, role, department, year, joined date — is public to any
// signed-in user by design (see the comment on listMembers below). Email is not: it's
// only ever rendered on the moderation page, which is already gated on members:moderate
// or members:assign-role, so a plain viewer has no legitimate use for it in the payload.
function publicMemberRow(m, { includeEmail = false } = {}) {
   const u = m.user || {};
   const rb = m.removedByUser;
   const removedBy = rb?._id
      ? { userId: rb._id, name: rb.name || "Unknown" }
      : null;
   return {
      userId: u._id || null,
      name: u.name || "Unknown",
      email: includeEmail ? u.email || null : undefined,
      department: u.profile?.department || null,
      year: u.profile?.year || null,
      role: m.role?.slug || null,
      status: m.status,
      joinedAt: m.joinedAt || null,
      leftAt: m.leftAt || null,
      removedBy,
      createdAt: m.createdAt,
   };
}

// A non-superAdmin may only moderate members ranked strictly below their own role —
// mirrors the weight hierarchy enforced on role assignment. coordinator weight is 100.
async function assertOutranks(callerCtx, targetRoleId) {
   if (callerCtx.isSuperAdmin) return;
   const targetRole = await ClubRole.findById(targetRoleId)
      .select("roleWeight")
      .lean();
   if ((targetRole?.roleWeight ?? 0) >= callerCtx.weight) {
      throw new ForbiddenError(
         "You can only manage members ranked below your own role",
      );
   }
}

// GET /api/clubs/:slug/members — paginated, filterable by role/status. Pending list is admin-only.
// Aggregation-based: role rank lives on ClubRole now, so we $lookup it to sort/filter by role.
async function listMembers(req, res) {
   const { q, role, status, sort: sortKey, page, limit } = req.validatedQuery;
   const club = await findClubBySlugFor(req.user, req.params.slug);

   // The approved roster is public to any logged-in user; non-approved listings need moderation.
   const viewerCtx = await resolveClubContext(req.user, club._id);
   const viewerIsCoordinator = contextCan(viewerCtx, "members:moderate");
   if (status !== "approved" && !viewerIsCoordinator) {
      throw new ForbiddenError("You don't have permission to view this list");
   }
   // Email rides with the moderation surfaces, which admit either permission — gating it
   // on members:moderate alone would blank the column for a role-assigner the page lets in.
   const viewerModerates =
      viewerIsCoordinator || contextCan(viewerCtx, "members:assign-role");

   // "past" is a convenience bucket for the audit tab = anyone no longer in the club.
   // It has to cover every sub-filter the tab offers, rejected applicants included.
   const statusFilter =
      status === "past" ? { $in: ["left", "removed", "rejected"] } : status;
   const match = { clubId: club._id, status: statusFilter };
   // Only buckets that can contain an admin-actioned row need that join. Rejection
   // records removedBy the same way removal does (see moderateMember), and the audit
   // tab's "Rejected" chip queries that status directly — without it the UI credits the
   // rejection to the applicant themselves.
   const joinsRemovedBy =
      status === "past" || status === "removed" || status === "rejected";

   // Approved → user-chosen sort (default: role rank then engagement); past → most-recent exit;
   // pending → oldest first (queue).
   const sort =
      status === "approved"
         ? sortKey === "new"
            ? { joinedAt: -1 }
            : { "role.roleWeight": -1, joinedAt: 1 }
         : status === "past"
           ? { leftAt: -1 }
           : { createdAt: 1 };

   const skip = (page - 1) * limit;

   // publicMemberRow reads five fields — don't drag whole user docs (password hash
   // included) through the pipeline for them.
   const userLookup = {
      $lookup: {
         from: "users",
         localField: "userId",
         foreignField: "_id",
         as: "user",
         pipeline: [
            ...(q
               ? [{ $match: { name: { $regex: escapeRegex(q), $options: "i" } } }]
               : []),
            {
               $project: {
                  name: 1,
                  email: 1,
                  "profile.department": 1,
                  "profile.year": 1,
               },
            },
         ],
      },
   };
   // A name search decides which rows match, so with one the join has to run before the
   // facet — scoped to this club's memberships, rather than scanning every user first.
   // Without one it stays inside the facet and only sees the page.
   const searchStages = q ? [userLookup, { $unwind: "$user" }] : [];
   const rowUserStages = q
      ? []
      : [
           userLookup,
           { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
        ];

   // The role join only has to precede the facet when something before pagination reads
   // it: a role filter, or the default approved sort that orders by role rank. On every
   // other tab it can run on the page instead of the whole club.
   const sortsOnRole = status === "approved" && sortKey !== "new";
   const roleBeforeFacet = !!role || sortsOnRole;
   const roleStages = [
      {
         $lookup: {
            from: "clubroles",
            localField: "roleId",
            foreignField: "_id",
            as: "role",
            // publicMemberRow reads the slug; the sort reads roleWeight.
            pipeline: [{ $project: { slug: 1, roleWeight: 1 } }],
         },
      },
      { $unwind: { path: "$role", preserveNullAndEmptyArrays: true } },
      ...(role ? [{ $match: { "role.slug": role } }] : []),
   ];

   const [agg] = await ClubMembership.aggregate([
      { $match: match },
      ...(roleBeforeFacet ? roleStages : []),
      ...searchStages,
      {
         $facet: {
            rows: [
               { $sort: sort },
               { $skip: skip },
               { $limit: limit },
               ...(roleBeforeFacet ? [] : roleStages),
               ...rowUserStages,
               // Join the acting admin so each removed row carries id + name. Only
               // `removed` rows ever have removedBy set, so every other tab would pay
               // for a join whose result is always null.
               ...(joinsRemovedBy
                  ? [
                       {
                          $lookup: {
                             from: "users",
                             localField: "removedBy",
                             foreignField: "_id",
                             as: "removedByUser",
                             pipeline: [{ $project: { name: 1 } }],
                          },
                       },
                       {
                          $unwind: {
                             path: "$removedByUser",
                             preserveNullAndEmptyArrays: true,
                          },
                       },
                    ]
                  : []),
            ],
            total: [{ $count: "n" }],
         },
      },
   ]);

   const total = agg.total[0]?.n || 0;

   return successResponse(res, 200, "Members", {
      items: agg.rows.map((r) =>
         publicMemberRow(r, { includeEmail: viewerModerates }),
      ),
      pagination: pageMeta(page, limit, total, agg.rows.length),
   });
}

// GET /api/clubs/:slug/members/stats — headline counts for the manage-members page.
async function getMemberStats(req, res) {
   const club = req.club; // resolved + gated by requireClubPermission

   const coordinatorRoleId = await systemRoleId(club._id, "coordinator");
   const agg = await ClubMembership.aggregate([
      { $match: { clubId: club._id } },
      {
         $group: {
            _id: {
               status: "$status",
               isCoordinator: { $eq: ["$roleId", coordinatorRoleId] },
            },
            n: { $sum: 1 },
         },
      },
   ]);

   const stats = { active: 0, pending: 0, coordinators: 0, past: 0 };
   for (const row of agg) {
      const { status, isCoordinator } = row._id;
      if (status === "approved") {
         stats.active += row.n;
         if (isCoordinator) stats.coordinators += row.n;
      } else if (status === "pending") {
         stats.pending += row.n;
      } else if (
         status === "left" ||
         status === "removed" ||
         status === "rejected"
      ) {
         // Matches listMembers' status=past bucket exactly (left + removed + rejected) —
         // this stat feeds the tab badge for that same list, so the two must agree.
         stats.past += row.n;
      }
   }
   return successResponse(res, 200, "Member stats", stats);
}

// PATCH /api/clubs/:slug/members/:userId/status — coordinator accepts/rejects a join request.
async function moderateMember(req, res) {
   const { status } = req.body; // "approved" | "rejected"
   const club = req.club; // resolved + gated by requireClubPermission

   const m = await ClubMembership.findOne({
      clubId: club._id,
      userId: req.params.userId,
   }).lean();
   if (!m) throw new NotFoundError("Membership not found");

   // Coordinators are managed only via the superAdmin /coordinators endpoint — never
   // approved/rejected/re-instated here (mirrors the guard in removeMember).
   const coordinatorRoleId = await systemRoleId(club._id, "coordinator");
   if (String(m.roleId) === String(coordinatorRoleId)) {
      throw new ForbiddenError(
         "Coordinators are managed via the coordinators endpoint",
      );
   }

   // Weight bound — matters most when re-inviting a removed member who kept a high-weight role.
   await assertOutranks(req.clubContext, m.roleId);

   if (status === "approved") {
      // Approving accepts a pending request OR re-invites an admin-removed member.
      if (m.status !== "pending" && m.status !== "removed") {
         throw new ConflictError("Membership is not pending or removed");
      }
   } else if (m.status !== "pending") {
      // rejecting only applies to a pending request
      throw new ConflictError("Membership is not pending");
   }

   const set =
      status === "approved"
         ? {
              status: "approved",
              joinedAt: new Date(),
              leftAt: null,
              removedBy: null,
           }
         : { status: "rejected", leftAt: new Date(), removedBy: req.user._id };

   // Guard on the pre-transition status so a concurrent approve counts at most once.
   const guard = {
      clubId: club._id,
      userId: req.params.userId,
      status:
         status === "approved" ? { $in: ["pending", "removed"] } : "pending",
   };
   const prev = await ClubMembership.findOneAndUpdate(guard, set, {
      returnDocument: "before",
   });
   if (!prev)
      throw new ConflictError("Membership was just updated; please retry");

   if (status === "approved") {
      await bumpClubStat(club._id, "memberCount", 1);
   }

   return successResponse(res, 200, "Member updated", { status });
}

// PATCH /api/clubs/:slug/members/:userId/role — change an approved member's role.
// Assigning OR removing the `coordinator` role is superAdmin-only; a per-club coordinator
// can't mint new coordinators or demote an existing one.
async function setMemberRole(req, res) {
   const { role: roleSlug } = req.body; // a ClubRole.slug in this club
   const club = req.club; // resolved + gated by requireClubPermission
   await ensureSystemRoles(club._id);
   const callerCtx = req.clubContext;

   // Target role must exist in this club.
   const targetRole = await ClubRole.findOne({
      clubId: club._id,
      slug: roleSlug,
   }).lean();
   if (!targetRole) throw new NotFoundError("No such role in this club");

   const m = await ClubMembership.findOne({
      clubId: club._id,
      userId: req.params.userId,
   });
   if (!m) throw new NotFoundError("Membership not found");
   if (m.status !== "approved") {
      throw new ConflictError("Can only set role on approved members");
   }

   // The member's current role (slug + weight) drives the coordinator + hierarchy guards below.
   const currentRole = await ClubRole.findById(m.roleId)
      .select("slug roleWeight")
      .lean();

   // Assigning OR removing the `coordinator` system role stays superAdmin-only.
   const touchesCoordinator =
      roleSlug === "coordinator" || currentRole?.slug === "coordinator";
   if (touchesCoordinator && req.user.role !== ROLES.SUPER_ADMIN) {
      throw new ForbiddenError(
         "Only a super admin can assign or remove the coordinator role",
      );
   }

   // Hierarchy (both ends): a non-superAdmin can only re-role members ranked below their own
   // role, and only into a role ranked below their own — can't touch someone who outranks them.
   if (!callerCtx.isSuperAdmin) {
      if ((currentRole?.roleWeight ?? 0) >= callerCtx.weight) {
         throw new ForbiddenError(
            "You can only change roles of members ranked below your own",
         );
      }
      if (targetRole.roleWeight >= callerCtx.weight) {
         throw new ForbiddenError("You can only assign roles below your own");
      }
      // Weight alone isn't enough: a lower-ranked role can still carry a permission the
      // assigner doesn't hold, which would make members:assign-role a route to it.
      assertCanGrant(callerCtx, { permissions: targetRole.permissions });
   }

   // Faculty are coordinators only: only a faculty may be coordinator, and a faculty
   // can never drop to a non-coordinator role — remove them from the club instead.
   const target = await User.findById(m.userId).select("role").lean();
   if (roleSlug === "coordinator" && target?.role !== ROLES.FACULTY) {
      throw new ConflictError(
         "Only faculty accounts can be made a club coordinator",
      );
   }
   if (roleSlug !== "coordinator" && target?.role === ROLES.FACULTY) {
      throw new ConflictError(
         "A faculty must stay a coordinator — remove them from the club instead",
      );
   }

   m.roleId = targetRole._id;
   await m.save();

   return successResponse(res, 200, "Member role updated", {
      role: targetRole.slug,
   });
}

// DELETE /api/clubs/:slug/members/:userId — coordinator removes a member (terminal state: "removed").
async function removeMember(req, res) {
   const club = req.club; // resolved + gated by requireClubPermission

   // Don't let a coordinator remove themselves via this endpoint — they should use leaveClub.
   if (String(req.user._id) === String(req.params.userId)) {
      throw new ConflictError("Use leave to remove your own membership");
   }

   const coordinatorRoleId = await systemRoleId(club._id, "coordinator");

   // Coordinators are managed only via the superAdmin coordinators endpoint — never kicked
   // here. This keeps the whole coordinator lifecycle (assign / step-down) superAdmin-owned.
   const target = await ClubMembership.findOne({
      clubId: club._id,
      userId: req.params.userId,
   })
      .select("roleId status")
      .lean();
   if (
      target &&
      ["approved", "pending"].includes(target.status) &&
      String(target.roleId) === String(coordinatorRoleId)
   ) {
      throw new ForbiddenError(
         "Use the coordinators endpoint to step a coordinator down first",
      );
   }

   // Weight bound — a non-superAdmin can only remove members ranked below their own role.
   if (target) await assertOutranks(req.clubContext, target.roleId);

   // Atomically flip an active member row to "removed"; the filter excludes coordinators and
   // only matches an active row, so a concurrent double-remove decrements the count at most once.
   const prev = await ClubMembership.findOneAndUpdate(
      {
         clubId: club._id,
         userId: req.params.userId,
         status: { $in: ["approved", "pending"] },
         roleId: { $ne: coordinatorRoleId },
      },
      { status: "removed", leftAt: new Date(), removedBy: req.user._id },
      { returnDocument: "before" },
   );
   if (!prev) throw new NotFoundError("No active membership");

   if (prev.status === "approved") {
      await bumpClubStat(club._id, "memberCount", -1);
      // Same rule as leaving: no membership, no seat at a members-only event.
      await releaseSeats(req.params.userId, {
         clubId: club._id,
         visibility: "private",
      });
   }

   return successResponse(res, 200, "Member removed", { status: "removed" });
}

// GET /api/clubs/:slug/members/search?q= — active students a moderator can add to the club
// (excludes anyone already approved or pending here). Drives the add-member picker.
async function searchAddableStudents(req, res) {
   const club = req.club; // resolved + gated by requireClubPermission(members, moderate)
   const { q } = req.validatedQuery;

   // Exclude students already in the club (approved or pending) — can't be added again.
   const inClub = await ClubMembership.find({
      clubId: club._id,
      status: { $in: ["approved", "pending"] },
   })
      .select("userId")
      .lean();
   const excludeIds = inClub.map((m) => m.userId);

   const filter = {
      role: ROLES.STUDENT,
      isActive: true,
      _id: { $nin: excludeIds },
   };
   // Empty query → the default opening list; otherwise a name/email regex match.
   if (q) {
      const rx = { $regex: escapeRegex(q), $options: "i" };
      filter.$or = [{ name: rx }, { email: rx }];
   }

   const students = await User.find(filter)
      .select("name email profile.department profile.year")
      .sort({ name: 1 })
      .limit(20)
      .lean();

   return successResponse(res, 200, "Students", {
      items: students.map((u) => ({
         userId: u._id,
         name: u.name,
         email: u.email,
         department: u.profile?.department || null,
         year: u.profile?.year || null,
      })),
   });
}

// POST /api/clubs/:slug/members — a moderator directly adds an active student as an approved
// member (bypasses the join-request flow). Faculty are coordinators only and can't be added here.
async function addMember(req, res) {
   const club = req.club; // resolved + gated by requireClubPermission(members, moderate)
   const { userId } = req.body;

   const user = await User.findOne({ _id: userId, role: ROLES.STUDENT })
      .select("isActive")
      .lean();
   if (!user) throw new NotFoundError("No student account with that id");
   if (!user.isActive) {
      throw new ConflictError("That student account is deactivated");
   }

   const existing = await ClubMembership.findOne({ userId, clubId: club._id })
      .select("status")
      .lean();
   if (existing?.status === "approved") {
      throw new ConflictError("Already a member of this club");
   }

   const memberRoleId = await systemRoleId(club._id, "member");

   // Upsert to approved with the member role; count off the atomic prior state so a concurrent
   // double-add increments memberCount at most once (mirrors joinClub / addCoordinator).
   const prev = await ClubMembership.findOneAndUpdate(
      { userId, clubId: club._id },
      {
         roleId: memberRoleId,
         status: "approved",
         joinedAt: new Date(),
         leftAt: null,
         removedBy: null,
      },
      { upsert: true, setDefaultsOnInsert: true, returnDocument: "before" },
   );

   if (prev?.status !== "approved") {
      await bumpClubStat(club._id, "memberCount", 1);
   }

   return successResponse(res, 200, "Member added", { userId });
}

// POST /api/clubs/:slug/coordinators — superAdmin assigns another faculty as a club coordinator.
async function addCoordinator(req, res) {
   const club = await findClubBySlugFor(req.user, req.params.slug);
   const { userId } = req.body;

   const user = await User.findOne({ _id: userId, role: ROLES.FACULTY })
      .select("isActive")
      .lean();
   if (!user) throw new NotFoundError("No faculty account with that id");
   if (!user.isActive) {
      throw new ConflictError("That faculty account is deactivated");
   }

   const coordinatorRoleId = await systemRoleId(club._id, "coordinator");

   // Advisory pre-check for a friendly error; correctness rides on the before-image below.
   const existing = await ClubMembership.findOne({ userId, clubId: club._id });
   if (
      existing?.status === "approved" &&
      String(existing.roleId) === String(coordinatorRoleId)
   ) {
      throw new ConflictError("Already a coordinator of this club");
   }

   // returnDocument: "before" lets us count off the atomic prior state, so a concurrent
   // double-add increments memberCount at most once (mirrors joinClub/removeCoordinator).
   const prev = await ClubMembership.findOneAndUpdate(
      { userId, clubId: club._id },
      {
         roleId: coordinatorRoleId,
         status: "approved",
         joinedAt: new Date(),
         leftAt: null,
         removedBy: null,
      },
      { upsert: true, setDefaultsOnInsert: true, returnDocument: "before" },
   );

   // Count them only if they weren't already an approved member of the club.
   if (prev?.status !== "approved") {
      await bumpClubStat(club._id, "memberCount", 1);
   }

   return successResponse(res, 200, "Coordinator added", { userId });
}

// DELETE /api/clubs/:slug/coordinators/:userId — superAdmin removes a coordinator from the club.
// A faculty can't hold a non-coordinator role, so this removes their membership outright.
async function removeCoordinator(req, res) {
   const club = await findClubBySlugFor(req.user, req.params.slug);
   const { userId } = req.params;
   const coordinatorRoleId = await systemRoleId(club._id, "coordinator");

   // Atomically flip the approved coordinator row to "removed" — a faculty is never a
   // plain member, so we remove rather than demote. Matching only an approved row means a
   // concurrent double-remove flips it at most once (same pattern as removeMember).
   const prev = await ClubMembership.findOneAndUpdate(
      {
         userId,
         clubId: club._id,
         status: "approved",
         roleId: coordinatorRoleId,
      },
      { status: "removed", leftAt: new Date(), removedBy: req.user._id },
      { returnDocument: "before" },
   );
   if (!prev) throw new NotFoundError("Not a coordinator of this club");

   // Enforce "a club must keep ≥1 coordinator" *after* removing, then roll back if this
   // was the last one. A count-then-remove guard would race: two simultaneous removes
   // could both see 2 and both delete. Remove-then-verify can't drop the club to zero —
   // whichever remove leaves none undoes itself (no transaction needed).
   const remaining = await ClubMembership.countDocuments({
      clubId: club._id,
      status: "approved",
      roleId: coordinatorRoleId,
   });
   if (remaining === 0) {
      await ClubMembership.updateOne(
         { _id: prev._id },
         { $set: { status: "approved", leftAt: null, removedBy: null } },
      );
      throw new ConflictError(
         "A club must keep at least one coordinator — add another before removing this one",
      );
   }

   await bumpClubStat(club._id, "memberCount", -1);

   return successResponse(res, 200, "Coordinator removed", { userId });
}

module.exports = {
   listMembers,
   getMemberStats,
   searchAddableStudents,
   addMember,
   moderateMember,
   setMemberRole,
   removeMember,
   addCoordinator,
   removeCoordinator,
};
