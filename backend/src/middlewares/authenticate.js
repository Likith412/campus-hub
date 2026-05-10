// Auth middleware: verifies the access JWT and attaches req.user. Use on any protected route.
const { verifyAccessToken } = require("../utils/jwt");
const { UnauthorizedError } = require("../utils/errors");
const { User } = require("../models");
const { redisClient } = require("../config/redis");

async function authenticate(req, res, next) {
   // Expect "Authorization: Bearer <token>".
   const header = req.headers.authorization;
   if (!header || !header.startsWith("Bearer ")) {
      throw new UnauthorizedError("Missing or invalid Authorization header");
   }

   const token = header.slice("Bearer ".length);
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
