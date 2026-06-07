// Account-security password controller — authenticated password change.
const { successResponse } = require("../../utils/response");
const { hashPassword, verifyPassword } = require("../../utils/password");
const { NotFoundError, UnauthorizedError } = require("../../utils/errors");
const { blacklistSessionAccess } = require("../../utils/sessionRevocation");
const { User, AuthSession } = require("../../models");
const { findCurrentSession } = require("./helpers");

// POST /profile/me/change-password — authenticated password change.
// Revokes all other sessions so old refresh tokens can't outlive the change.
async function changePassword(req, res) {
   const { currentPassword, newPassword } = req.body;
   const user = await User.findById(req.user._id);
   if (!user) throw new NotFoundError("User not found");

   const ok = await verifyPassword(currentPassword, user.passwordHash);
   if (!ok) throw new UnauthorizedError("Current password is incorrect");

   user.passwordHash = await hashPassword(newPassword);
   await user.save();

   // Keep the current session alive; revoke everything else + kill their access JWTs now.
   const current = await findCurrentSession(req);
   const filter = {
      userId: user._id,
      revokedAt: null,
      ...(current ? { _id: { $ne: current._id } } : {}),
   };
   const others = await AuthSession.find(filter, "_id").lean();
   await blacklistSessionAccess(others.map((s) => s._id));
   await AuthSession.updateMany(filter, { revokedAt: new Date() });

   return successResponse(res, 200, "Password changed");
}

module.exports = { changePassword };
