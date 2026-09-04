// Account-security account controller — account deletion (danger zone).
const { successResponse } = require("../../utils/response");
const { ConflictError } = require("../../utils/errors");
const { User, ClubMembership } = require("../../models");
const { revokeSessions } = require("./helpers");
const { ROLES } = require("../../constants/roles");
const { bumpClubStat } = require("../clubs/helpers");
const { releaseSeats } = require("../events/helpers");
const {
   clearRefreshCookie,
   clearAccessCookie,
   clearSessionHintCookie,
} = require("../../utils/cookies");

// Clubs this user coordinates that would be left with nobody in charge. Deleting the
// account is the one path that could break the "a club keeps at least one coordinator"
// rule that leaveClub and removeCoordinator both enforce.
async function soleCoordinatorClubs(userId) {
   // Start from this user's own memberships. Looking up every coordinator role on the
   // platform first would scan the whole clubroles collection — `slug` is not a prefix
   // of either of its indexes.
   const mine = await ClubMembership.find({ userId, status: "approved" })
      .populate({ path: "clubId", select: "name" })
      .populate({ path: "roleId", select: "slug clubId" })
      .lean();
   const coordinated = mine.filter(
      (m) => m.clubId && m.roleId?.slug === "coordinator",
   );
   const roleIdByClub = new Map(
      coordinated.map((m) => [String(m.clubId._id), m.roleId._id]),
   );

   const orphaned = [];
   for (const m of coordinated) {
      const others = await ClubMembership.countDocuments({
         clubId: m.clubId._id,
         status: "approved",
         roleId: roleIdByClub.get(String(m.clubId._id)),
         userId: { $ne: userId },
      });
      if (others === 0) orphaned.push(m.clubId.name);
   }
   return orphaned;
}

// DELETE /profile/me — soft delete. Sessions revoked, passwordHash scrubbed, deletedAt set.
// A background job can hard-delete after the retention window.
async function deleteAccount(req, res) {
   // The institute would have no administrator left.
   if (req.user.role === ROLES.SUPER_ADMIN) {
      throw new ConflictError("A super admin account can't be deleted");
   }

   const orphaned = await soleCoordinatorClubs(req.user._id);
   if (orphaned.length) {
      throw new ConflictError(
         `You're the only coordinator of ${orphaned.join(", ")} — a super admin must assign another before you can delete your account`,
      );
   }

   // Close out what the account still holds elsewhere. Without this the club rosters
   // keep listing someone whose profile 404s, stats.memberCount stays inflated, and
   // every event seat they held is occupied forever — the waitlist never advances.
   const now = new Date();
   const memberships = await ClubMembership.find({
      userId: req.user._id,
      status: { $in: ["approved", "pending"] },
   })
      .select("clubId status")
      .lean();
   if (memberships.length) {
      await ClubMembership.updateMany(
         { userId: req.user._id, status: { $in: ["approved", "pending"] } },
         { $set: { status: "left", leftAt: now, removedBy: null } },
      );
      for (const m of memberships) {
         if (m.status === "approved") {
            await bumpClubStat(m.clubId, "memberCount", -1);
         }
      }
   }
   await releaseSeats(req.user._id);

   await User.updateOne(
      { _id: req.user._id },
      {
         $set: {
            deletedAt: now,
            isActive: false,
            passwordHash: "deleted",
         },
      },
   );
   await revokeSessions({ userId: req.user._id, revokedAt: null });
   // Same teardown as logout — without it the browser keeps a refresh cookie and the
   // session hint for 30 days and spends two requests per cold load rediscovering that
   // the account is gone.
   clearRefreshCookie(res);
   clearAccessCookie(res);
   clearSessionHintCookie(res);
   return successResponse(res, 200, "Account deleted");
}

module.exports = { deleteAccount };
