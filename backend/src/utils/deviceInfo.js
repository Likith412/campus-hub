// Builds the `deviceInfo` payload stored on AuthSession.
// ua-parser-js extracts browser/OS/device from User-Agent; geoip-lite resolves IP → city/region/country
// against a bundled MaxMind GeoLite2 db (no network call).
const { UAParser } = require("ua-parser-js");
const geoip = require("geoip-lite");

function buildDeviceInfo(req) {
   const ua = UAParser(req.headers["user-agent"] || "");
   const ip = req.ip;
   const geo = ip ? geoip.lookup(ip) : null;

   return {
      ip,
      browser: ua.browser?.name,
      browserVersion: ua.browser?.version,
      os: ua.os?.name,
      osVersion: ua.os?.version,
      deviceType: ua.device?.type || "desktop", // ua-parser leaves desktop blank
      deviceVendor: ua.device?.vendor,
      deviceModel: ua.device?.model,
      city: geo?.city || undefined,
      region: geo?.region || undefined,
      country: geo?.country || undefined,
      timezone: geo?.timezone || undefined,
   };
}

module.exports = { buildDeviceInfo };
