// Bcrypt password hashing. Cost 12 = ~250ms/hash, a good security/UX balance for 2026 hardware.
const bcrypt = require("bcrypt");

const BCRYPT_COST = 12;

async function hashPassword(plain) {
   return bcrypt.hash(plain, BCRYPT_COST);
}

// Constant-time comparison built into bcrypt (no timing attacks).
async function verifyPassword(plain, hash) {
   return bcrypt.compare(plain, hash);
}

module.exports = { hashPassword, verifyPassword };
