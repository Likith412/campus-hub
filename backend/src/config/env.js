// Environment-derived values shared across modules, so a fallback is written once.
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

module.exports = { FRONTEND_URL };
