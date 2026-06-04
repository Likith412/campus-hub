// Account-security controller — backs the Settings page's sensitive operations:
// password change, active-session management, and account deletion. Split out of the
// profile controller so credential/session logic lives apart from profile data.
const { successResponse } = require("../utils/response");
const { hashPassword, verifyPassword } = require("../utils/password");
const { sha256 } = require("../utils/tokens");
const {
   NotFoundError,
   UnauthorizedError,
   ConflictError,
} = require("../utils/errors");
const { REFRESH_COOKIE_NAME } = require("../utils/cookies");
const { blacklistSessionAccess } = require("../utils/sessionRevocation");
const { User, AuthSession } = require("../models");

// Resolve which AuthSession matches the caller's refresh cookie.
async function findCurrentSession(req) {
   const token = req.cookies?.[REFRESH_COOKIE_NAME];
   if (!token) return null;
   return AuthSession.findOne({
      userId: req.user._id,
      refreshTokenHash: sha256(token),
      revokedAt: null,
      expiresAt: { $gt: new Date() },
   }).lean();
}

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

// GET /profile/me/sessions — list active sessions for the Sessions & devices panel.
async function getSessions(req, res) {
   const current = await findCurrentSession(req);

   const sessions = await AuthSession.find({
      userId: req.user._id,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
   })
      .sort({ updatedAt: -1 })
      .lean();

   const items = sessions.map((s) => {
      const d = s.deviceInfo || {};
      // Composed strings the UI renders verbatim.
      const browserLabel = [d.browser, d.browserVersion?.split(".")[0]]
         .filter(Boolean)
         .join(" ");
      const deviceLabel =
         [d.deviceVendor, d.deviceModel].filter(Boolean).join(" ") ||
         d.os ||
         "Unknown device";
      const locationLabel = [d.city, d.region, d.country]
         .filter(Boolean)
         .join(", ");
      return {
         id: s._id,
         ip: d.ip,
         deviceLabel,
         browserLabel,
         locationLabel,
         deviceType: d.deviceType,
         isCurrent: !!current && String(s._id) === String(current._id),
         createdAt: s.createdAt,
         lastActiveAt: s.updatedAt,
         expiresAt: s.expiresAt,
      };
   });

   return successResponse(res, 200, "Sessions", { items });
}

// DELETE /profile/me/sessions/:id — revoke a single session.
async function revokeSession(req, res) {
   const session = await AuthSession.findOne({
      _id: req.params.id,
      userId: req.user._id,
   });
   if (!session) throw new NotFoundError("Session not found");

   // Use /auth/logout to end the current session — this endpoint is for other devices only.
   const current = await findCurrentSession(req);
   if (current && String(session._id) === String(current._id)) {
      throw new ConflictError("Use logout to end the current session");
   }

   await blacklistSessionAccess([session._id]);
   session.revokedAt = new Date();
   await session.save();
   return successResponse(res, 200, "Session revoked");
}

// POST /profile/me/sessions/revoke-others — "Sign out everywhere else" button.
async function revokeOtherSessions(req, res) {
   const current = await findCurrentSession(req);
   const filter = {
      userId: req.user._id,
      revokedAt: null,
      ...(current ? { _id: { $ne: current._id } } : {}),
   };
   const others = await AuthSession.find(filter, "_id").lean();
   await blacklistSessionAccess(others.map((s) => s._id));
   const result = await AuthSession.updateMany(filter, {
      revokedAt: new Date(),
   });
   return successResponse(res, 200, "Other sessions revoked", {
      revokedCount: result.modifiedCount,
   });
}

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

module.exports = {
   changePassword,
   getSessions,
   revokeSession,
   revokeOtherSessions,
   deleteAccount,
};
