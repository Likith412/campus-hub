// Top-level API router. Add new feature routers here (e.g., clubs, events).
const express = require("express");
const authRoutes = require("./auth");

const router = express.Router();
router.use("/auth", authRoutes);

module.exports = router;
