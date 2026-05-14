// Auth middleware: verifies the access JWT and attaches req.user. Use on any protected route.
const { verifyAccessToken } = require("../utils/jwt");
const { UnauthorizedError } = require("../utils/errors");
const { ACCESS_COOKIE_NAME } = require("../utils/cookies");
const { User } = require("../models");
const { redisClient } = require("../config/redis");

async function authenticate(req, res, next) {
   // Access token lives in an httpOnly cookie (sent automatically by the browser).
   const token = req.cookies?.[ACCESS_COOKIE_NAME];
   if (!token) {
      throw new UnauthorizedError("Not authenticated");
   }

   let payload;
   try {
      payload = verifyAccessToken(token);
   } catch {
      // Hide jwt internals — uniform unauthorized error to the client.
      throw new UnauthorizedError("Invalid or expired token");
   }

   // Honor server-side revocation (logout adds the token's jti to this Redis blacklist).
   const blacklisted = await redisClient.get(`bl:${payload.jti}`);
   if (blacklisted) throw new UnauthorizedError("Token has been revoked");

   // Pull a fresh user record so role/isActive checks always reflect current DB state.
   const user = await User.findById(payload.sub).lean();
   if (!user || !user.isActive) {
      throw new UnauthorizedError("Account not found or inactive");
   }

   // Stash on req for downstream handlers; jti/exp let logout blacklist this exact token.
   req.user = user;
   req.tokenJti = payload.jti;
   req.tokenExp = payload.exp;
   next();
}

module.exports = authenticate;
