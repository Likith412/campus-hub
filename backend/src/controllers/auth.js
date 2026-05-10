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
const { redisClient } = require("../config/redis");
const {
   sendVerificationEmail,
   sendPasswordResetEmail,
} = require("../services/emailService");

const REFRESH_TTL_MS =
   Number(process.env.JWT_REFRESH_TTL_DAYS || 30) * 24 * 60 * 60 * 1000;
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

// Create a refresh-token row tied to this device. Returns the raw token (caller sets the cookie).
async function issueRefreshSession(userId, req) {
   const refreshToken = randomToken();
   await AuthSession.create({
      userId,
      refreshTokenHash: sha256(refreshToken), // Only the hash is stored.
      deviceInfo: {
         userAgent: req.headers["user-agent"]?.slice(0, 200),
         ip: req.ip,
      },
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
   });
   return refreshToken;
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

// POST /auth/register — create the user, hash their password, send verification email.
// User cannot log in until they verify their email (enforced in `login`).
async function register(req, res) {
   const { email, password, name } = req.body;

   if (await User.exists({ email })) {
      throw new ConflictError("Email already registered");
   }

   const passwordHash = await hashPassword(password);
   const user = await User.create({ email, passwordHash, name });

   const verifyToken = await issueVerificationToken(user._id);
   const link = `${FRONTEND_URL}/verify-email?token=${verifyToken}`;
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

   const { token: accessToken } = signAccessToken(user);
   const refreshToken = await issueRefreshSession(user._id, req);

   user.lastLoginAt = new Date();
   await user.save();

   setRefreshCookie(res, refreshToken);
   return successResponse(res, 200, "Logged in", {
      accessToken,
      user: publicUser(user),
   });
}

// POST /auth/refresh — exchange a valid refresh cookie for a new access token.
// Refresh-token rotation: the old refresh token is replaced on every use.
async function refresh(req, res) {
   const token = req.cookies?.[REFRESH_COOKIE_NAME];
   if (!token) throw new UnauthorizedError("No refresh token");

   // Look up the session by hash (raw token never persisted).
   const session = await AuthSession.findOne({
      refreshTokenHash: sha256(token),
      revokedAt: null,
      expiresAt: { $gt: new Date() },
   });
   if (!session) throw new UnauthorizedError("Invalid refresh token");

   const user = await User.findById(session.userId);
   if (!user || !user.isActive) {
      throw new UnauthorizedError("Account not found or inactive");
   }

   // Rotate the refresh token — sliding expiration + invalidates the old token if reused.
   const newRefresh = randomToken();
   session.refreshTokenHash = sha256(newRefresh);
   session.expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
   await session.save();

   const { token: accessToken } = signAccessToken(user);
   setRefreshCookie(res, newRefresh);
   return successResponse(res, 200, "Token refreshed", { accessToken });
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

   // Blacklist the access JWT in Redis until its natural expiry — `authenticate` checks this.
   if (req.tokenJti && req.tokenExp) {
      const ttl = req.tokenExp - Math.floor(Date.now() / 1000);
      if (ttl > 0) {
         await redisClient.set(`bl:${req.tokenJti}`, "1", { EX: ttl });
      }
   }

   clearRefreshCookie(res);
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
      await sendPasswordResetEmail(email, link);
   }

   return successResponse(
      res,
      200,
      "If that email exists, a reset link was sent.",
   );
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

   // Force re-login on every device — any previously-issued refresh tokens are invalid.
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
   resetPassword,
};
