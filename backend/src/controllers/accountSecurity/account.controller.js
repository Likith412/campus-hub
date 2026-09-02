// Account-security account controller — account deletion (danger zone).
const { successResponse } = require("../../utils/response");
const { ConflictError } = require("../../utils/errors");
const { User, ClubMembership, ClubRole } = require("../../models");
const { revokeSessions } = require("./helpers");
const { ROLES } = require("../../constants/roles");

// Clubs this user coordinates that would be left with nobody in charge. Deleting the
// account is the one path that could break the "a club keeps at least one coordinator"
// rule that leaveClub and removeCoordinator both enforce.
async function soleCoordinatorClubs(userId) {
   const coordinatorRoles = await ClubRole.find({ slug: "coordinator" })
      .select("_id clubId")
      .lean();
   const roleIdByClub = new Map(
      coordinatorRoles.map((r) => [String(r.clubId), r._id]),
   );

   const mine = await ClubMembership.find({
      userId,
      status: "approved",
      roleId: { $in: coordinatorRoles.map((r) => r._id) },
   })
      .populate({ path: "clubId", select: "name" })
      .lean();

   const orphaned = [];
   for (const m of mine) {
      if (!m.clubId) continue;
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

   await User.updateOne(
      { _id: req.user._id },
      {
         $set: {
            deletedAt: new Date(),
            isActive: false,
            passwordHash: "deleted",
         },
      },
   );
   await revokeSessions({ userId: req.user._id, revokedAt: null });
   return successResponse(res, 200, "Account deleted");
}

module.exports = { deleteAccount };
