// Account-security account controller — account deletion (danger zone).
const { successResponse } = require("../../utils/response");
const { blacklistSessionAccess } = require("../../utils/sessionRevocation");
const { User, AuthSession } = require("../../models");

// DELETE /profile/me — soft delete. Sessions revoked, passwordHash scrubbed, deletedAt set.
// A background job can hard-delete after the retention window.
async function deleteAccount(req, res) {
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
   const active = await AuthSession.find(
      { userId: req.user._id, revokedAt: null },
      "_id",
   ).lean();
   await blacklistSessionAccess(active.map((s) => s._id));
   await AuthSession.updateMany(
      { userId: req.user._id, revokedAt: null },
      { revokedAt: new Date() },
   );
   return successResponse(res, 200, "Account deleted");
}

module.exports = { deleteAccount };
