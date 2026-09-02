// Shared Redis client: rate-limit counters, the session blacklist, and the refresh-token
// rotation locks.
const { createClient } = require("redis");

const redisClient = createClient({
   url: process.env.REDIS_URL,
});

// Log connection/runtime errors instead of crashing the process.
redisClient.on("error", (err) => {
   console.error("Redis client error:", err);
});

async function connectRedis() {
   await redisClient.connect();
}

// quit() flushes pending commands before closing — preferred over disconnect().
async function disconnectRedis() {
   await redisClient.quit();
}

module.exports = { redisClient, connectRedis, disconnectRedis };
