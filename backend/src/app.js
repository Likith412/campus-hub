// Express app setup: middleware pipeline, route mounting, and central error handler.
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const routes = require("./routes");
const errorHandler = require("./middlewares/errorHandler");

const app = express();

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
   res.send({ message: "CampusHub API" });
});

// All API endpoints live under /api (auth, clubs, events, ...).
app.use("/api", routes);

// Final middleware — converts thrown AppErrors into uniform JSON responses.
app.use(errorHandler);

module.exports = app;
