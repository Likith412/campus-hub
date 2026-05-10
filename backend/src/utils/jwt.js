// Short-lived access JWTs. Refresh tokens are opaque and stored in AuthSession (see controllers/auth.js).
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const ACCESS_TTL = process.env.JWT_ACCESS_TTL || "15m";

// Sign an access token with a unique jti so it can be revoked via Redis blacklist on logout.
function signAccessToken(user) {
   const jti = crypto.randomUUID();
   const payload = { sub: user._id.toString(), role: user.role, jti };

   const token = jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_TTL });
   return { token, jti };
}

// Throws if invalid/expired — callers must catch and translate to UnauthorizedError.
function verifyAccessToken(token) {
   return jwt.verify(token, ACCESS_SECRET);
}

module.exports = { signAccessToken, verifyAccessToken };
