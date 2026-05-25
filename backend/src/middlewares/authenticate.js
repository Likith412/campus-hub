// Auth middleware: verifies the access JWT and attaches req.user. Use on any protected route.
const { verifyAccessToken } = require("../utils/jwt");
const { UnauthorizedError } = require("../utils/errors");
const { ACCESS_COOKIE_NAME } = require("../utils/cookies");
const { User } = require("../models");
const { isSessionBlacklisted } = require("../utils/sessionRevocation");

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

   // Session-level revocation kills every access JWT issued for that AuthSession.
   if (await isSessionBlacklisted(payload.sid)) {
      throw new UnauthorizedError("Session has been revoked");
   }

   // Pull a fresh user record so role/isActive checks always reflect current DB state.
   const user = await User.findById(payload.sub).lean();
   if (!user || !user.isActive) {
      throw new UnauthorizedError("Account not found or inactive");
   }

   req.user = user;
   req.tokenSid = payload.sid;
   next();
}

module.exports = authenticate;
