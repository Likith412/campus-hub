// Per-IP rate limiters for sensitive endpoints. Counters live in Redis so they work across multiple instances.
const rateLimit = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");
const { redisClient } = require("../config/redis");

// Uniform 429 JSON response (matches our standard error envelope).
function jsonHandler(req, res) {
   res.status(429).json({
      success: false,
      error: { code: "RATE_LIMITED", message: "Too many requests" },
   });
}

// Builds a Redis-backed store with the given key prefix so limiters don't collide.
function makeStore(prefix) {
   return new RedisStore({
      prefix,
      sendCommand: (...args) => redisClient.sendCommand(args),
   });
}

// 5 login attempts / 15 min — slows credential stuffing.
const loginLimiter = rateLimit({
   windowMs: 15 * 60 * 1000,
   max: 5,
   handler: jsonHandler,
   standardHeaders: true,
   legacyHeaders: false,
   store: makeStore("rl:login:"),
});

// 5 registrations / hour — prevents bulk fake-account creation.
const registerLimiter = rateLimit({
   windowMs: 60 * 60 * 1000,
   max: 5,
   handler: jsonHandler,
   standardHeaders: true,
   legacyHeaders: false,
   store: makeStore("rl:register:"),
});

// 3 forgot/reset attempts / hour — protects against reset-link abuse / email spam.
const passwordLimiter = rateLimit({
   windowMs: 60 * 60 * 1000,
   max: 3,
   handler: jsonHandler,
   standardHeaders: true,
   legacyHeaders: false,
   store: makeStore("rl:password:"),
});

// 3 resend-verification calls / hour — same idea, prevents email flooding.
const verificationLimiter = rateLimit({
   windowMs: 60 * 60 * 1000,
   max: 3,
   handler: jsonHandler,
   standardHeaders: true,
   legacyHeaders: false,
   store: makeStore("rl:verification:"),
});

module.exports = {
   loginLimiter,
   registerLimiter,
   passwordLimiter,
   verificationLimiter,
};
