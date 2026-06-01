// Top-level API router. Add new feature routers here (e.g., clubs, events).
const express = require("express");
const authRoutes = require("./auth");
const profileRoutes = require("./profile");
const clubRoutes = require("./clubs");

const router = express.Router();
router.use("/auth", authRoutes);
router.use("/profile", profileRoutes);
router.use("/clubs", clubRoutes);

module.exports = router;
