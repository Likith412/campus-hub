// Shared helpers for the auth controllers (auth lifecycle, email verification).
const { randomToken, sha256 } = require("../../utils/tokens");
const { EmailVerification } = require("../../models");
const { FRONTEND_URL } = require("../../config/env");
const { sendVerificationEmail } = require("../../services/emailService");

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // Email verification link valid for 24h.

// Strip private fields (passwordHash, etc.) before sending a user back to the client.
// `profile` carries only what the sidebar subtitle renders — the full profile is a
// separate call.
function publicUser(u) {
   return {
      id: u._id,
      email: u.email,
      name: u.name,
      role: u.role,
      emailVerified: u.emailVerified,
      profile: {
         department: u.profile?.department || null,
         year: u.profile?.year || null,
      },
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

// Issue a token, compose the link, and queue the email. Logged in dev so the flow works
// without an email provider configured.
async function sendVerificationLink(userId, email) {
   const token = await issueVerificationToken(userId);
   const link = `${FRONTEND_URL}/verify-email?token=${token}`;
   if (process.env.NODE_ENV !== "production") {
      console.log(`[dev] verification link for ${email}: ${link}`);
   }
   await sendVerificationEmail(email, link);
}

module.exports = {
   publicUser,
   sendVerificationLink,
};
