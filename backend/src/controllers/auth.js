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
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

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

async function issueRefreshSession(userId, req) {
   const refreshToken = randomToken();
   await AuthSession.create({
      userId,
      refreshTokenHash: sha256(refreshToken),
      deviceInfo: {
         userAgent: req.headers["user-agent"]?.slice(0, 200),
         ip: req.ip,
      },
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
   });
   return refreshToken;
}

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

async function login(req, res) {
   const { email, password } = req.body;

   const user = await User.findOne({ email });
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

async function refresh(req, res) {
   const token = req.cookies?.[REFRESH_COOKIE_NAME];
   if (!token) throw new UnauthorizedError("No refresh token");

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

   const newRefresh = randomToken();
   session.refreshTokenHash = sha256(newRefresh);
   session.expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
   await session.save();

   const { token: accessToken } = signAccessToken(user);
   setRefreshCookie(res, newRefresh);
   return successResponse(res, 200, "Token refreshed", { accessToken });
}

async function logout(req, res) {
   const token = req.cookies?.[REFRESH_COOKIE_NAME];
   if (token) {
      await AuthSession.findOneAndUpdate(
         { refreshTokenHash: sha256(token) },
         { revokedAt: new Date() },
      );
   }

   if (req.tokenJti && req.tokenExp) {
      const ttl = req.tokenExp - Math.floor(Date.now() / 1000);
      if (ttl > 0) {
         await redisClient.set(`bl:${req.tokenJti}`, "1", { EX: ttl });
      }
   }

   clearRefreshCookie(res);
   return successResponse(res, 200, "Logged out");
}

async function me(req, res) {
   return successResponse(res, 200, "Current user", {
      user: publicUser(req.user),
   });
}

async function verifyEmail(req, res) {
   const { token } = req.query;
   if (!token) throw new UnauthorizedError("Missing token");

   const record = await EmailVerification.findOne({
      tokenHash: sha256(token),
      usedAt: null,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
   });
   if (!record) throw new UnauthorizedError("Invalid or expired token");

   await User.updateOne({ _id: record.userId }, { emailVerified: true });
   record.usedAt = new Date();
   await record.save();

   return successResponse(res, 200, "Email verified");
}

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

   record.usedAt = new Date();
   await record.save();

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
