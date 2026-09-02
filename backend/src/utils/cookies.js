// Auth cookie helpers. Both access and refresh tokens live in httpOnly cookies so JS can't read them (XSS-safe).
const { accessTtlSeconds } = require("./jwt");

const REFRESH_COOKIE_NAME = "refresh_token";
const ACCESS_COOKIE_NAME = "access_token";
// Non-httpOnly "you probably have a session" hint cookie. Contains no secret —
// just lets the SPA skip the /auth/me bootstrap call for anonymous visitors.
const SESSION_HINT_COOKIE_NAME = "has_session";

// In production the SPA and the API are separate origins — two different *.onrender.com
// hosts are different *sites*, because onrender.com is on the Public Suffix List — so a
// SameSite=Strict cookie would never be attached to the SPA's requests and every call
// would 401. None is the only value that travels cross-site, and browsers only honour it
// over HTTPS. Set COOKIE_SAMESITE=strict when both ends share a registrable domain.
const isProduction = () => process.env.NODE_ENV === "production";
const cookieSameSite = () =>
   process.env.COOKIE_SAMESITE || (isProduction() ? "none" : "strict");
const cookieSecure = () => cookieSameSite() === "none" || isProduction();

// Scoped to /api so endpoints that need to identify the current session
// (auth/refresh, auth/logout, profile/sessions, profile/change-password) all receive it.
// httpOnly + a same-site value are the CSRF defences; a narrower path would lock those out.
function refreshCookieOptions() {
   const days = Number(process.env.JWT_REFRESH_TTL_DAYS || 30);
   return {
      httpOnly: true,
      secure: cookieSecure(),
      sameSite: cookieSameSite(),
      domain: process.env.COOKIE_DOMAIN || undefined,
      path: "/api",
      maxAge: days * 24 * 60 * 60 * 1000,
   };
}

// Access cookie is sent to every /api route; its maxAge tracks the JWT's own TTL.
function accessCookieOptions() {
   return {
      httpOnly: true,
      secure: cookieSecure(),
      sameSite: cookieSameSite(),
      domain: process.env.COOKIE_DOMAIN || undefined,
      path: "/api",
      maxAge: accessTtlSeconds() * 1000,
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
      secure: cookieSecure(),
      sameSite: cookieSameSite(),
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
   setRefreshCookie,
   clearRefreshCookie,
   setAccessCookie,
   clearAccessCookie,
   setSessionHintCookie,
   clearSessionHintCookie,
};
