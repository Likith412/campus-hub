// Shared helpers for the account-security controllers (password, sessions, account).
const { sha256 } = require("../../utils/tokens");
const { REFRESH_COOKIE_NAME } = require("../../utils/cookies");
const { AuthSession } = require("../../models");

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

module.exports = { findCurrentSession };
