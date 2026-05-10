const bcrypt = require("bcrypt");

const BCRYPT_COST = 12;

async function hashPassword(plain) {
   return bcrypt.hash(plain, BCRYPT_COST);
}

async function verifyPassword(plain, hash) {
   return bcrypt.compare(plain, hash);
}

module.exports = { hashPassword, verifyPassword };
