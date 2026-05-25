// Blacklist access JWTs by session id so revocation kills outstanding tokens immediately
// instead of waiting for them to expire naturally.
const { redisClient } = require("../config/redis");

const ACCESS_TTL_SEC = Number(process.env.JWT_ACCESS_TTL_MINUTES || 15) * 60;

const key = (sessionId) => `bl:sid:${sessionId}`;

// Mark each session's access tokens dead until they would have expired anyway.
async function blacklistSessionAccess(sessionIds) {
   if (!sessionIds?.length) return;
   await Promise.all(
      sessionIds
         .filter(Boolean)
         .map((id) =>
            redisClient.set(key(id.toString()), "1", { EX: ACCESS_TTL_SEC }),
         ),
   );
}

async function isSessionBlacklisted(sessionId) {
   if (!sessionId) return false;
   return !!(await redisClient.get(key(sessionId)));
}

module.exports = { blacklistSessionAccess, isSessionBlacklisted };
