// Shared helpers for the account-security controllers (password, sessions, account).
const { sha256 } = require("../../utils/tokens");
const { REFRESH_COOKIE_NAME } = require("../../utils/cookies");
const { AuthSession } = require("../../models");
const { blacklistSessionAccess } = require("../../utils/sessionRevocation");

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

// Kill every session matching `filter`. Order matters: blacklist the access JWTs while
// the rows still match, then mark the refresh rows revoked.
async function revokeSessions(filter) {
   const rows = await AuthSession.find(filter, "_id").lean();
   await blacklistSessionAccess(rows.map((s) => s._id));
   const result = await AuthSession.updateMany(filter, { revokedAt: new Date() });
   return result.modifiedCount;
}

module.exports = { findCurrentSession, revokeSessions };
