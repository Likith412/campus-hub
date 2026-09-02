// Blacklist access JWTs by session id so revocation kills outstanding tokens immediately
// instead of waiting for them to expire naturally.
const { redisClient } = require("../config/redis");
const { accessTtlSeconds } = require("./jwt");

const key = (sessionId) => `bl:sid:${sessionId}`;

// Mark each session's access tokens dead until they would have expired anyway.
async function blacklistSessionAccess(sessionIds) {
   if (!sessionIds?.length) return;
   await Promise.all(
      sessionIds
         .filter(Boolean)
         .map((id) =>
            redisClient.set(key(id.toString()), "1", {
               EX: accessTtlSeconds(),
            }),
         ),
   );
}

async function isSessionBlacklisted(sessionId) {
   if (!sessionId) return false;
   return !!(await redisClient.get(key(sessionId)));
}

module.exports = { blacklistSessionAccess, isSessionBlacklisted };
