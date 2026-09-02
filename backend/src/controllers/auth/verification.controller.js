// Email verification controller — verify-email and resend-verification.
const { successResponse } = require("../../utils/response");
const { sha256 } = require("../../utils/tokens");
const { UnauthorizedError } = require("../../utils/errors");
const { User, EmailVerification } = require("../../models");
const { sendVerificationLink } = require("./helpers");

// GET /auth/verify-email?token=... — flips the user's emailVerified flag and consumes the token.
async function verifyEmail(req, res) {
   const { token } = req.query;
   // A repeated ?token= arrives as an array — that's a malformed link, not a valid one.
   if (!token || typeof token !== "string") {
      throw new UnauthorizedError("Missing token");
   }

   // Match by hash + ensure not used/revoked/expired.
   const record = await EmailVerification.findOne({
      tokenHash: sha256(token),
      usedAt: null,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
   });
   if (!record) throw new UnauthorizedError("Invalid or expired token");

   await User.updateOne({ _id: record.userId }, { emailVerified: true });
   record.usedAt = new Date(); // Mark consumed — single-use.
   await record.save();

   return successResponse(res, 200, "Email verified");
}

// POST /auth/resend-verification — re-sends the verification link.
// Always returns the same message regardless of whether the email exists (anti-enumeration).
async function resendVerification(req, res) {
   const { email } = req.body;
   const user = await User.findOne({ email });

   if (user && !user.emailVerified) {
      await sendVerificationLink(user._id, email);
   }

   return successResponse(
      res,
      200,
      "If that email exists, a verification link was sent.",
   );
}

module.exports = {
   verifyEmail,
   resendVerification,
};
