const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const ACCESS_TTL = process.env.JWT_ACCESS_TTL || "15m";

function signAccessToken(user) {
   const jti = crypto.randomUUID();
   const payload = { sub: user._id.toString(), role: user.role, jti };

   const token = jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_TTL });
   return { token, jti };
}

function verifyAccessToken(token) {
   return jwt.verify(token, ACCESS_SECRET);
}

module.exports = { signAccessToken, verifyAccessToken };
