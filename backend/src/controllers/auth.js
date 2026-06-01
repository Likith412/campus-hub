// Auth controller — handles register, login, refresh, logout, me, email verification, password reset.
// Token model: short-lived JWT access token + opaque refresh token stored as an httpOnly cookie
// and tracked server-side via AuthSession (so we can revoke per-device).
const { successResponse } = require("../utils/response");
const { hashPassword, verifyPassword } = require("../utils/password");
const { signAccessToken } = require("../utils/jwt");
const { randomToken, sha256 } = require("../utils/tokens");
const {
   REFRESH_COOKIE_NAME,
   setRefreshCookie,
   clearRefreshCookie,
   setAccessCookie,
   clearAccessCookie,
   setSessionHintCookie,
   clearSessionHintCookie,
} = require("../utils/cookies");
const {
   UnauthorizedError,
   ForbiddenError,
   ConflictError,
} = require("../utils/errors");
const {
   User,
   AuthSession,
   EmailVerification,
   PasswordReset,
} = require("../models");
const { ROLES } = require("../constants/roles");
const { redisClient } = require("../config/redis");
const { blacklistSessionAccess } = require("../utils/sessionRevocation");
const { buildDeviceInfo } = require("../utils/deviceInfo");
const {
   sendVerificationEmail,
   sendPasswordResetEmail,
} = require("../services/emailService");

// === Refresh token rotation settings ===
const REFRESH_TTL_MS =
   Number(process.env.JWT_REFRESH_TTL_DAYS || 30) * 24 * 60 * 60 * 1000;
// How long the rotated token stays cached in Redis for concurrent/late refreshers to reuse.
const REFRESH_RESULT_TTL_SEC = Number(process.env.REFRESH_RESULT_TTL_SEC || 10);

// Per-token lock so concurrent refreshes serialize: one rotates, the rest wait and reuse.
const REFRESH_LOCK_TTL_SEC = 5; // 5s for the rotate-and-DB-update to complete.
const REFRESH_WAIT_TIMEOUT_MS = 4_000; // 4s max wait for the lock holder to finish rotating and publish the new token before giving up.
const REFRESH_WAIT_POLL_MS = 50; // poll every 50ms for the result or lock release.

function sleep(ms) {
   return new Promise((r) => setTimeout(r, ms));
}

// Block until the lock holder publishes a result token, the lock disappears, or we time out.
async function waitForRotationResult(resultKey, lockKey) {
   const deadline = Date.now() + REFRESH_WAIT_TIMEOUT_MS;
   while (Date.now() < deadline) {
      const result = await redisClient.get(resultKey);
      if (result) return result;
      const lockStillHeld = await redisClient.get(lockKey);
      if (!lockStillHeld) {
         // Holder finished without publishing — likely an error path; one more read then give up.
         return redisClient.get(resultKey);
      }
      await sleep(REFRESH_WAIT_POLL_MS);
   }
   return null;
}
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // Email verification link valid for 24h.
const RESET_TTL_MS = 30 * 60 * 1000; // Password reset link valid for 30min (tighter — sensitive op).
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

// Create a refresh-token row tied to this device. Returns raw token + session id for the JWT sid.
async function issueRefreshSession(userId, req) {
   const refreshToken = randomToken();
   const session = await AuthSession.create({
      userId,
      refreshTokenHash: sha256(refreshToken), // Only the hash is stored.
      deviceInfo: buildDeviceInfo(req),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
   });
   return { refreshToken, sessionId: session._id };
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

// Same pattern as verification: revoke stale tokens then issue a new one. Prevents multiple-link confusion.
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

// POST /auth/register — student self-signup only.
// User cannot log in until they verify their email (enforced in `login`).
async function register(req, res) {
   const { email, password, name } = req.body;

   if (await User.exists({ email })) {
      throw new ConflictError("Email already registered");
   }

   const passwordHash = await hashPassword(password);
   const user = await User.create({
      email,
      passwordHash,
      name,
      role: ROLES.STUDENT,
   });

   const verifyToken = await issueVerificationToken(user._id);
   const link = `${FRONTEND_URL}/verify-email?token=${verifyToken}`;
   if (process.env.NODE_ENV !== "production") {
      console.log(`[dev] verification link for ${email}: ${link}`);
   }
   await sendVerificationEmail(email, link);

   return successResponse(
      res,
      201,
      "Account created. Check your email to verify.",
      { user: publicUser(user) },
   );
}

// POST /auth/login — verify credentials, issue access JWT (response body) + refresh cookie.
async function login(req, res) {
   const { email, password } = req.body;

   const user = await User.findOne({ email });
   // Same generic message for "user not found" and "wrong password" (no account enumeration).
   if (!user || !user.isActive) {
      throw new UnauthorizedError("Invalid credentials");
   }

   const ok = await verifyPassword(password, user.passwordHash);
   if (!ok) throw new UnauthorizedError("Invalid credentials");

   if (!user.emailVerified) {
      throw new ForbiddenError("Email not verified. Check your inbox.");
   }

   const { refreshToken, sessionId } = await issueRefreshSession(user._id, req);
   const { token: accessToken } = signAccessToken(user, sessionId);

   user.lastLoginAt = new Date();
   await user.save();

   setRefreshCookie(res, refreshToken);
   setAccessCookie(res, accessToken);
   setSessionHintCookie(res);
   return successResponse(res, 200, "Logged in", {
      user: publicUser(user),
   });
}

// POST /auth/refresh — rotate the refresh token and issue a new access token.
// Concurrency: first caller per old token wins a Redis lock and rotates; the rest wait
// (or hit the post-rotation fast-path) and reuse the same new token.
async function refresh(req, res) {
   const token = req.cookies?.[REFRESH_COOKIE_NAME];
   if (!token) throw new UnauthorizedError("No refresh token");

   const incomingHash = sha256(token);
   const lockKey = `lock:refresh:${incomingHash}`; // rotation lock key for this token
   const resultKey = `rot:${incomingHash}`; // rotation result kwy

   // Fast-path: rotation already completed — reuse the published new token.
   let refreshToken = await redisClient.get(resultKey);

   if (!refreshToken) {
      const acquired = await redisClient.set(lockKey, "1", {
         NX: true,
         EX: REFRESH_LOCK_TTL_SEC,
      });

      if (acquired) {
         try {
            const now = new Date();
            const candidate = randomToken();

            // Atomic rotate on the current hash.
            const session = await AuthSession.findOneAndUpdate(
               {
                  refreshTokenHash: incomingHash,
                  revokedAt: null,
                  expiresAt: { $gt: now },
               },
               {
                  refreshTokenHash: sha256(candidate),
                  expiresAt: new Date(now.getTime() + REFRESH_TTL_MS),
               },
               { returnDocument: "after" },
            );
            if (!session) throw new UnauthorizedError("Invalid refresh token");

            // Publish so concurrent/late waiters reuse this exact token.
            await redisClient.set(resultKey, candidate, {
               EX: REFRESH_RESULT_TTL_SEC,
            });
            refreshToken = candidate;
         } finally {
            await redisClient.del(lockKey);
         }
      } else {
         refreshToken = await waitForRotationResult(resultKey, lockKey);
         if (!refreshToken)
            throw new UnauthorizedError("Invalid refresh token");
      }
   }

   // Look up the session by the (possibly reused) new hash to load the user.
   const session = await AuthSession.findOne({
      refreshTokenHash: sha256(refreshToken),
      revokedAt: null,
      expiresAt: { $gt: new Date() },
   }).lean();
   if (!session) throw new UnauthorizedError("Invalid refresh token");

   const user = await User.findById(session.userId);
   if (!user || !user.isActive) {
      throw new UnauthorizedError("Account not found or inactive");
   }

   const { token: accessToken } = signAccessToken(user, session._id);
   setRefreshCookie(res, refreshToken);
   setAccessCookie(res, accessToken);
   setSessionHintCookie(res);
   return successResponse(res, 200, "Token refreshed");
}

// POST /auth/logout — revoke the current refresh session and blacklist the access token until it expires.
async function logout(req, res) {
   const token = req.cookies?.[REFRESH_COOKIE_NAME];
   if (token) {
      // Revoke the server-side refresh session so it can't be used again.
      await AuthSession.findOneAndUpdate(
         { refreshTokenHash: sha256(token) },
         { revokedAt: new Date() },
      );
   }

   // Blacklist this session so its access JWT (and any other still in-flight) dies immediately.
   if (req.tokenSid) await blacklistSessionAccess([req.tokenSid]);

   clearRefreshCookie(res);
   clearAccessCookie(res);
   clearSessionHintCookie(res);
   return successResponse(res, 200, "Logged out");
}

// GET /auth/me — return the authenticated user (req.user is populated by `authenticate`).
async function me(req, res) {
   return successResponse(res, 200, "Current user", {
      user: publicUser(req.user),
   });
}

// GET /auth/verify-email?token=... — flips the user's emailVerified flag and consumes the token.
async function verifyEmail(req, res) {
   const { token } = req.query;
   if (!token) throw new UnauthorizedError("Missing token");

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
      const token = await issueVerificationToken(user._id);
      const link = `${FRONTEND_URL}/verify-email?token=${token}`;
      if (process.env.NODE_ENV !== "production") {
         console.log(`[dev] verification link for ${email}: ${link}`);
      }
      await sendVerificationEmail(email, link);
   }

   return successResponse(
      res,
      200,
      "If that email exists, a verification link was sent.",
   );
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

module.exports = {
   register,
   login,
   refresh,
   logout,
   me,
   verifyEmail,
   resendVerification,
   forgotPassword,
   validateResetToken,
   resetPassword,
};
