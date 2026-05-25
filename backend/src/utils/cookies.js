// Auth cookie helpers. Both access and refresh tokens live in httpOnly cookies so JS can't read them (XSS-safe).
const REFRESH_COOKIE_NAME = "refresh_token";
const ACCESS_COOKIE_NAME = "access_token";
// Non-httpOnly "you probably have a session" hint cookie. Contains no secret —
// just lets the SPA skip the /auth/me bootstrap call for anonymous visitors.
const SESSION_HINT_COOKIE_NAME = "has_session";

// Hardened cookie options. Path is scoped to /api/auth so it's only sent to auth endpoints.
function refreshCookieOptions() {
   const days = Number(process.env.JWT_REFRESH_TTL_DAYS || 30);
   return {
      httpOnly: true, // Block JS access (mitigates XSS token theft).
      secure: process.env.NODE_ENV === "production", // HTTPS-only in prod.
      sameSite: "strict", // CSRF protection.
      domain: process.env.COOKIE_DOMAIN || undefined,
      path: "/api/auth/refresh", // Only send to refresh endpoint.
      maxAge: days * 24 * 60 * 60 * 1000,
   };
}

// Access cookie is sent to every /api route. Cookie maxAge should track JWT_ACCESS_TTL — keep
// JWT_ACCESS_TTL_MINUTES in sync if you change the JWT TTL.
function accessCookieOptions() {
   const minutes = Number(process.env.JWT_ACCESS_TTL_MINUTES || 15);
   return {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      domain: process.env.COOKIE_DOMAIN || undefined,
      path: "/api",
      maxAge: minutes * 60 * 1000,
   };
}

function setRefreshCookie(res, token) {
   res.cookie(REFRESH_COOKIE_NAME, token, refreshCookieOptions());
}

function clearRefreshCookie(res) {
   res.clearCookie(REFRESH_COOKIE_NAME, {
      ...refreshCookieOptions(),
      maxAge: 0,
   });
}

function setAccessCookie(res, token) {
   res.cookie(ACCESS_COOKIE_NAME, token, accessCookieOptions());
}

function clearAccessCookie(res) {
   res.clearCookie(ACCESS_COOKIE_NAME, {
      ...accessCookieOptions(),
      maxAge: 0,
   });
}

// Hint cookie: readable by JS, lives as long as the refresh token. Contains "1" — no secret.
function sessionHintCookieOptions() {
   const days = Number(process.env.JWT_REFRESH_TTL_DAYS || 30);
   return {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      domain: process.env.COOKIE_DOMAIN || undefined,
      path: "/",
      maxAge: days * 24 * 60 * 60 * 1000,
   };
}

function setSessionHintCookie(res) {
   res.cookie(SESSION_HINT_COOKIE_NAME, "1", sessionHintCookieOptions());
}

function clearSessionHintCookie(res) {
   res.clearCookie(SESSION_HINT_COOKIE_NAME, {
      ...sessionHintCookieOptions(),
      maxAge: 0,
   });
}

module.exports = {
   REFRESH_COOKIE_NAME,
   ACCESS_COOKIE_NAME,
   SESSION_HINT_COOKIE_NAME,
   setRefreshCookie,
   clearRefreshCookie,
   setAccessCookie,
   clearAccessCookie,
   setSessionHintCookie,
   clearSessionHintCookie,
};
