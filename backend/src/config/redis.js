const { createClient } = require("redis");

const redisClient = createClient();

redisClient.on("error", (err) => {
   console.error("Redis client error:", err);
});

async function connectRedis() {
   await redisClient.connect();
}

async function disconnectRedis() {
   await redisClient.quit();
}

module.exports = { redisClient, connectRedis, disconnectRedis };
