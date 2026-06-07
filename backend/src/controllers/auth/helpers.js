// Shared helpers for the auth controllers (auth lifecycle, email verification).
const { randomToken, sha256 } = require("../../utils/tokens");
const { EmailVerification } = require("../../models");

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // Email verification link valid for 24h.
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// Strip private fields (passwordHash, etc.) before sending a user back to the client.
function publicUser(u) {
   return {
      id: u._id,
      email: u.email,
      name: u.name,
      role: u.role,
      emailVerified: u.emailVerified,
      avatarUrl: u.avatarUrl,
   };
}

// Revoke any prior pending verification tokens for this user, then issue a fresh one.
async function issueVerificationToken(userId) {
   await EmailVerification.updateMany(
      { userId, usedAt: null, revokedAt: null },
      { revokedAt: new Date() },
   );
   const token = randomToken();
   await EmailVerification.create({
      userId,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
   });
   return token;
}

module.exports = {
   VERIFY_TTL_MS,
   FRONTEND_URL,
   publicUser,
   issueVerificationToken,
};
