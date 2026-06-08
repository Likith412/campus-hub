// Top-level API router. Add new feature routers here (e.g., clubs, events).
const express = require("express");
const authRoutes = require("./auth");
const profileRoutes = require("./profile");
const clubRoutes = require("./clubs");
const adminRoutes = require("./admin");
const permissionRoutes = require("./permissions");
const accountSecurityRoutes = require("./accountSecurity");

const router = express.Router();

// accountSecurity isn't a single-prefix feature — its routes span /auth and /profile/me, so it's
// mounted at the root with full paths. Mount it first so it owns those exact paths (and they don't
// fall through the /profile authenticate middleware twice).
router.use(accountSecurityRoutes);

router.use("/auth", authRoutes);
router.use("/profile", profileRoutes);
router.use("/clubs", clubRoutes);
router.use("/admin", adminRoutes);
router.use("/permissions", permissionRoutes);

module.exports = router;
