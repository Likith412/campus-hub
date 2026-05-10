const { verifyAccessToken } = require("../utils/jwt");
const { UnauthorizedError } = require("../utils/errors");
const { User } = require("../models");

async function authenticate(req, res, next) {
   const header = req.headers.authorization;
   if (!header || !header.startsWith("Bearer ")) {
      throw new UnauthorizedError("Missing or invalid Authorization header");
   }

   const token = header.slice("Bearer ".length);
   let payload;
   try {
      payload = verifyAccessToken(token);
   } catch {
      throw new UnauthorizedError("Invalid or expired token");
   }

   const user = await User.findById(payload.sub).lean();
   if (!user || !user.isActive) {
      throw new UnauthorizedError("Account not found or inactive");
   }

   req.user = user;
   req.tokenJti = payload.jti;
   req.tokenExp = payload.exp;
   next();
}

module.exports = authenticate;
