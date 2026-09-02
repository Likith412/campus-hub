// Cross-club announcement digest, mounted at /api/announcements. The club-scoped
// board lives on /api/clubs/:slug/announcements (see routes/clubs.js).
const express = require("express");

const announcements = require("../controllers/announcements");
const authenticate = require("../middlewares/authenticate");
const { validateQuery } = require("../middlewares/validate");
const { listMyAnnouncementsQuerySchema } = require("../validators/announcements");

const router = express.Router();
router.use(authenticate);

router.get(
   "/",
   validateQuery(listMyAnnouncementsQuerySchema),
   announcements.listMyAnnouncements,
);

module.exports = router;
