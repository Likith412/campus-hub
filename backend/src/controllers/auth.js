const { successResponse } = require("../utils/response");
const { hashPassword, verifyPassword } = require("../utils/password");
const { signAccessToken } = require("../utils/jwt");
const { randomToken, sha256 } = require("../utils/tokens");
const {
   REFRESH_COOKIE_NAME,
   setRefreshCookie,
   clearRefreshCookie,
} = require("../utils/cookies");
const { UnauthorizedError, ConflictError } = require("../utils/errors");
const { User, AuthSession } = require("../models");

const REFRESH_TTL_MS =
   Number(process.env.JWT_REFRESH_TTL_DAYS || 30) * 24 * 60 * 60 * 1000;

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

async function register(req, res) {
   const { email, password, name } = req.body;

   if (await User.exists({ email })) {
      throw new ConflictError("Email already registered");
   }

   const passwordHash = await hashPassword(password);
   const user = await User.create({ email, passwordHash, name });

   return successResponse(res, 201, "Account created", {
      user: publicUser(user),
   });
}

async function login(req, res) {
   const { email, password } = req.body;

   const user = await User.findOne({ email });
   if (!user || !user.isActive) {
      throw new UnauthorizedError("Invalid credentials");
   }

   const ok = await verifyPassword(password, user.passwordHash);
   if (!ok) throw new UnauthorizedError("Invalid credentials");

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

   clearRefreshCookie(res);
   return successResponse(res, 200, "Logged out");
}

async function me(req, res) {
   return successResponse(res, 200, "Current user", {
      user: publicUser(req.user),
   });
}

module.exports = {
   register,
   login,
   refresh,
   logout,
   me,
};
