// Short-lived access JWTs. Refresh tokens are opaque and stored in AuthSession (see controllers/auth.js).
const jwt = require("jsonwebtoken");

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const ACCESS_TTL = process.env.JWT_ACCESS_TTL || "15m";

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

module.exports = { signAccessToken, verifyAccessToken };
