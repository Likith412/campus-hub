// Short-lived access JWTs. Refresh tokens are opaque and stored in AuthSession
// (see controllers/auth/auth.controller.js).
const jwt = require("jsonwebtoken");

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const ACCESS_TTL = process.env.JWT_ACCESS_TTL || "15m";

// Same lifetime in seconds, for the cookie maxAge and the revocation blacklist. Anything
// that has to outlive an access token derives from here rather than its own env var.
function accessTtlSeconds() {
   const m = /^(\d+)([smhd])?$/.exec(String(ACCESS_TTL).trim());
   if (!m) return 15 * 60;
   const mult = { s: 1, m: 60, h: 3600, d: 86400 }[m[2] || "s"];
   return Number(m[1]) * mult;
}

// sid binds the JWT to its AuthSession so revocation invalidates it instantly via Redis.
function signAccessToken(user, sessionId) {
   const payload = {
      sub: user._id.toString(),
      sid: sessionId?.toString(),
   };

   const token = jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_TTL });
   return { token };
}

// Throws if invalid/expired — callers must catch and translate to UnauthorizedError.
function verifyAccessToken(token) {
   return jwt.verify(token, ACCESS_SECRET);
}

module.exports = { signAccessToken, verifyAccessToken, accessTtlSeconds };
