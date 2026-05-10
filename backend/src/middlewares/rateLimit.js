const rateLimit = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");
const { redisClient } = require("../config/redis");

function jsonHandler(req, res) {
   res.status(429).json({
      success: false,
      error: { code: "RATE_LIMITED", message: "Too many requests" },
   });
}

function makeStore(prefix) {
   return new RedisStore({
      prefix,
      sendCommand: (...args) => redisClient.sendCommand(args),
   });
}

const loginLimiter = rateLimit({
   windowMs: 15 * 60 * 1000,
   max: 5,
   handler: jsonHandler,
   standardHeaders: true,
   legacyHeaders: false,
   store: makeStore("rl:login:"),
});

const registerLimiter = rateLimit({
   windowMs: 60 * 60 * 1000,
   max: 5,
   handler: jsonHandler,
   standardHeaders: true,
   legacyHeaders: false,
   store: makeStore("rl:register:"),
});

const passwordLimiter = rateLimit({
   windowMs: 60 * 60 * 1000,
   max: 3,
   handler: jsonHandler,
   standardHeaders: true,
   legacyHeaders: false,
   store: makeStore("rl:password:"),
});

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
