// Cross-club event routes mounted at /api/events. Club-scoped writes (create/edit/cancel)
// live under /api/clubs/:slug/events instead, where requireClubPermission can resolve the club.
const express = require("express");

const events = require("../controllers/events");
const announcements = require("../controllers/announcements");
const authenticate = require("../middlewares/authenticate");
const { validateQuery } = require("../middlewares/validate");
const {
   listPublicEventsQuerySchema,
   listMyEventsQuerySchema,
} = require("../validators/events");

const router = express.Router();
router.use(authenticate);

// Browse published events across every active club.
router.get(
   "/",
   validateQuery(listPublicEventsQuerySchema),
   events.listPublicEvents,
);
// The caller's own registrations — declared before /:eventId so "me" isn't read as an id.
router.get("/me", validateQuery(listMyEventsQuerySchema), events.listMyEvents);
router.get("/:eventId", events.getEvent);

// Notices posted about this event, for its detail page.
router.get("/:eventId/announcements", announcements.listEventAnnouncements);

// Take a seat / give it up. Membership of the host club is enforced in the controller.
router.post("/:eventId/register", events.registerForEvent);
router.delete("/:eventId/register", events.unregisterFromEvent);

module.exports = router;
