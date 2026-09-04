// Cross-club announcement digest, mounted at /api/announcements. The club-scoped
// board lives on /api/clubs/:slug/announcements (see routes/clubs.js).
const express = require("express");

const announcements = require("../controllers/announcements");
const authenticate = require("../middlewares/authenticate");
const requireRole = require("../middlewares/requireRole");
const { ROLES } = require("../constants/roles");
const { validateQuery } = require("../middlewares/validate");
const { listMyAnnouncementsQuerySchema } = require("../validators/announcements");

const router = express.Router();
router.use(authenticate);

// Students only. The digest is built from memberships and follows — faculty work from
// each club's own board, and a superAdmin holds neither, so the feed is empty for both.
router.get(
   "/",
   requireRole(ROLES.STUDENT),
   validateQuery(listMyAnnouncementsQuerySchema),
   announcements.listMyAnnouncements,
);

module.exports = router;
