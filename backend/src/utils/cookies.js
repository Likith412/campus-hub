const REFRESH_COOKIE_NAME = "refresh_token";

function refreshCookieOptions() {
   const days = Number(process.env.JWT_REFRESH_TTL_DAYS || 30);
   return {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      domain: process.env.COOKIE_DOMAIN || undefined,
      path: "/api/auth",
      maxAge: days * 24 * 60 * 60 * 1000,
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

module.exports = {
   REFRESH_COOKIE_NAME,
   setRefreshCookie,
   clearRefreshCookie,
};
