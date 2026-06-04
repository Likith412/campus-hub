// Password-reset controller — the "forgot password" flow (request link, validate token,
// set new password). Split out of the auth controller: it's a self-contained flow with its
// own one-time-token model (PasswordReset), distinct from login/session lifecycle.
const { successResponse } = require("../utils/response");
const { hashPassword } = require("../utils/password");
const { randomToken, sha256 } = require("../utils/tokens");
const { UnauthorizedError } = require("../utils/errors");
const { User, PasswordReset, AuthSession } = require("../models");
const { blacklistSessionAccess } = require("../utils/sessionRevocation");
const { sendPasswordResetEmail } = require("../services/emailService");

const RESET_TTL_MS = 30 * 60 * 1000; // Reset link valid for 30min (tighter — sensitive op).
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// Revoke stale reset tokens then issue a new one. Prevents multiple-link confusion.
async function issuePasswordResetToken(userId) {
   await PasswordReset.updateMany(
      { userId, usedAt: null, revokedAt: null },
      { revokedAt: new Date() },
   );
   const token = randomToken();
   await PasswordReset.create({
      userId,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
   });
   return token;
}

// POST /auth/forgot-password — emails a reset link if the account exists.
// Generic response (no leak of which emails are registered).
async function forgotPassword(req, res) {
   const { email } = req.body;
   const user = await User.findOne({ email });

   if (user) {
      const token = await issuePasswordResetToken(user._id);
      const link = `${FRONTEND_URL}/reset-password?token=${token}`;
      if (process.env.NODE_ENV !== "production") {
         console.log(`[dev] password reset link for ${email}: ${link}`);
      }
      await sendPasswordResetEmail(email, link);
   }

   return successResponse(
      res,
      200,
      "If that email exists, a reset link was sent.",
   );
}

// GET /auth/reset-password/validate?token=... — checks if a reset token is still usable.
// Used by the reset page to decide whether to show the form or the "request a new link" CTA.
// Does NOT consume the token.
async function validateResetToken(req, res) {
   const { token } = req.query;
   if (!token || typeof token !== "string") {
      throw new UnauthorizedError("Invalid or expired token");
   }
   const record = await PasswordReset.findOne({
      tokenHash: sha256(token),
      usedAt: null,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
   });
   if (!record) throw new UnauthorizedError("Invalid or expired token");
   return successResponse(res, 200, "Token is valid");
}

// POST /auth/reset-password — set a new password using a one-time reset token.
// Also revokes all existing sessions so a leaked refresh token can't outlive the reset.
async function resetPassword(req, res) {
   const { token, password } = req.body;

   const record = await PasswordReset.findOne({
      tokenHash: sha256(token),
      usedAt: null,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
   });
   if (!record) throw new UnauthorizedError("Invalid or expired token");

   const passwordHash = await hashPassword(password);
   await User.updateOne({ _id: record.userId }, { passwordHash });

   record.usedAt = new Date(); // Single-use.
   await record.save();

   // Kill every device immediately: revoke refresh sessions AND blacklist their access JWTs.
   const active = await AuthSession.find(
      { userId: record.userId, revokedAt: null },
      "_id",
   ).lean();
   await blacklistSessionAccess(active.map((s) => s._id));
   await AuthSession.updateMany(
      { userId: record.userId, revokedAt: null },
      { revokedAt: new Date() },
   );

   return successResponse(res, 200, "Password reset. Please log in.");
}

module.exports = { forgotPassword, validateResetToken, resetPassword };
