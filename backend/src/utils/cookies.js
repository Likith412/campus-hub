// Refresh-token cookie helpers. Refresh token is stored in an httpOnly cookie so JS can't read it (XSS-safe).
const REFRESH_COOKIE_NAME = "refresh_token";

// Hardened cookie options. Path is scoped to /api/auth so it's only sent to auth endpoints.
function refreshCookieOptions() {
   const days = Number(process.env.JWT_REFRESH_TTL_DAYS || 30);
   return {
      httpOnly: true, // Block JS access (mitigates XSS token theft).
      secure: process.env.NODE_ENV === "production", // HTTPS-only in prod.
      sameSite: "strict", // CSRF protection.
      domain: process.env.COOKIE_DOMAIN || undefined,
      path: "/api/auth",
      maxAge: days * 24 * 60 * 60 * 1000,
   };
}

function setRefreshCookie(res, token) {
   res.cookie(REFRESH_COOKIE_NAME, token, refreshCookieOptions());
}

// Must use the same options (path/domain) the cookie was set with for the browser to actually clear it.
function clearRefreshCookie(res) {
   res.clearCookie(REFRESH_COOKIE_NAME, {
      ...refreshCookieOptions(),
      maxAge: 0,
   });
}

module.exports = {
   REFRESH_COOKIE_NAME,
   setRefreshCookie,
   clearRefreshCookie,
};
