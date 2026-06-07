// Auth controller — register, login, refresh, logout, me.
// Token model: short-lived JWT access token + opaque refresh token stored as an httpOnly cookie
// and tracked server-side via AuthSession (so we can revoke per-device).
const { successResponse } = require("../../utils/response");
const { hashPassword, verifyPassword } = require("../../utils/password");
const { signAccessToken } = require("../../utils/jwt");
const { randomToken, sha256 } = require("../../utils/tokens");
const {
   REFRESH_COOKIE_NAME,
   setRefreshCookie,
   clearRefreshCookie,
   setAccessCookie,
   clearAccessCookie,
   setSessionHintCookie,
   clearSessionHintCookie,
} = require("../../utils/cookies");
const {
   UnauthorizedError,
   ForbiddenError,
   ConflictError,
} = require("../../utils/errors");
const { User, Student, AuthSession } = require("../../models");
const { redisClient } = require("../../config/redis");
const { blacklistSessionAccess } = require("../../utils/sessionRevocation");
const { buildDeviceInfo } = require("../../utils/deviceInfo");
const { sendVerificationEmail } = require("../../services/emailService");
const { FRONTEND_URL, publicUser, issueVerificationToken } = require("./helpers");

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

// POST /auth/register — student self-signup only.
// User cannot log in until they verify their email (enforced in `login`).
async function register(req, res) {
   const { email, password, name } = req.body;

   if (await User.exists({ email })) {
      throw new ConflictError("Email already registered");
   }

   const passwordHash = await hashPassword(password);
   // Student discriminator — sets role: "student" and the student-only schema.
   const user = await Student.create({ email, passwordHash, name });

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

module.exports = {
   register,
   login,
   refresh,
   logout,
   me,
};
