// Account-security sessions controller — the Sessions & devices panel.
const { successResponse } = require("../../utils/response");
const { NotFoundError, ConflictError } = require("../../utils/errors");
const { AuthSession } = require("../../models");
const { findCurrentSession, revokeSessions } = require("./helpers");

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

   await revokeSessions({ _id: session._id });
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
   const revokedCount = await revokeSessions(filter);
   return successResponse(res, 200, "Other sessions revoked", { revokedCount });
}

module.exports = {
   getSessions,
   revokeSession,
   revokeOtherSessions,
};
