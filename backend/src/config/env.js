// Environment-derived values shared across modules, so a fallback is written once.
// Trailing slashes are stripped: CORS compares origins exactly, so "https://app/" would
// match nothing the browser ever sends.
const FRONTEND_URL = (process.env.FRONTEND_URL || "http://localhost:5173").replace(
   /\/+$/,
   "",
);

module.exports = { FRONTEND_URL };
