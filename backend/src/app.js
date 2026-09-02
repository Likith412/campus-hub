// Express app setup: middleware pipeline, route mounting, and central error handler.
const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const morgan = require("morgan");

const routes = require("./routes");
const errorHandler = require("./middlewares/errorHandler");
const { NotFoundError } = require("./utils/errors");

const app = express();

// Trust reverse proxy to get the real client IP from X-Forwarded-For header.
const trustProxy = process.env.TRUST_PROXY;
if (trustProxy) {
   const n = Number(trustProxy);
   app.set("trust proxy", Number.isFinite(n) ? n : trustProxy);
} else if (process.env.NODE_ENV === "production") {
   app.set("trust proxy", 1); // sensible default: one hop (the immediate reverse proxy)
}

const writeStream = fs.createWriteStream(
   path.join(__dirname, "..", "access.log"),
   { flags: "a" },
);

// Request logging — concise "dev" format locally, "combined" in production for log aggregation.
app.use(
   morgan(process.env.NODE_ENV === "production" ? "combined" : "dev", {
      stream: writeStream,
   }),
);

// Allow the frontend origin and send/receive cookies (needed for refresh-token cookie).
app.use(
   cors({
      origin: process.env.FRONTEND_URL || "http://localhost:5173",
      credentials: true,
   }),
);
// Parse JSON bodies; small limit guards against oversized payloads.
app.use(express.json({ limit: "10kb" }));
// Parse cookies so middleware/handlers can read req.cookies (refresh token lives here).
app.use(cookieParser());

// Health/landing route — quick sanity check that the API is up.
app.get("/", (_req, res) => {
   res.send({ message: "Campus Hub API" });
});

// All API endpoints live under /api (auth, clubs, events, ...).
app.use("/api", routes);

// Unknown /api path — answer in the same envelope as every other error.
app.use("/api", (req, _res, next) => {
   next(new NotFoundError(`Cannot ${req.method} ${req.baseUrl}${req.path}`));
});

// Final middleware — converts thrown AppErrors into uniform JSON responses.
app.use(errorHandler);

module.exports = app;
