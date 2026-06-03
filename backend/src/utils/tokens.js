// Helpers for opaque tokens (refresh, email verification, password reset).
// We send the raw token to the user but store only its sha256 — DB leak ≠ usable tokens.
const crypto = require("crypto");

// Cryptographically secure random hex token. 32 bytes -> 64 hex chars.
function randomToken(bytes = 32) {
   return crypto.randomBytes(bytes).toString("hex");
}

// Deterministic hash used for DB lookups (lookup by hash, never store the raw token).
function sha256(value) {
   return crypto.createHash("sha256").update(value).digest("hex");
}

// Readable temporary password for generated accounts (faculty onboarding).
// Excludes ambiguous chars (0/O, 1/l/I) so it's easy to type from an email.
function generateTempPassword(length = 12) {
   const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
   const bytes = crypto.randomBytes(length);
   let out = "";
   for (let i = 0; i < length; i++) {
      out += charset[bytes[i] % charset.length];
   }
   return out;
}

module.exports = { randomToken, sha256, generateTempPassword };
