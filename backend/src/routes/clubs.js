// Clubs routes mounted at /api/clubs. All routes are authenticated.
const express = require("express");

const clubs = require("../controllers/clubs");
const events = require("../controllers/events");
const announcements = require("../controllers/announcements");
const authenticate = require("../middlewares/authenticate");
const requireRole = require("../middlewares/requireRole");
const requireClubPermission = require("../middlewares/requireClubPermission");
const { requireAnyClubPermission } = require("../middlewares/requireClubPermission");
const validate = require("../middlewares/validate");
const { validateQuery } = require("../middlewares/validate");
const { ROLES } = require("../constants/roles");
const {
   getClubQuerySchema,
   listClubsQuerySchema,
   listMembersQuerySchema,
   searchMembersQuerySchema,
   addMemberBodySchema,
   memberStatusBodySchema,
   memberRoleBodySchema,
   createClubBodySchema,
   updateClubBodySchema,
   addCoordinatorBodySchema,
   verificationBodySchema,
   statusBodySchema,
   createRoleBodySchema,
   updateRoleBodySchema,
} = require("../validators/clubs");
const {
   createAnnouncementBodySchema,
   pinAnnouncementBodySchema,
   listAnnouncementsQuerySchema,
} = require("../validators/announcements");
const {
   createEventBodySchema,
   updateEventBodySchema,
   eventStatusBodySchema,
   listEventsQuerySchema,
   listAttendeesQuerySchema,
} = require("../validators/events");

const router = express.Router();
router.use(authenticate);

// ============================================================================
//  CLUBS — browse + lifecycle  (controllers/clubs/clubs.controller)
// ============================================================================
// Browse/join is a student feature — superAdmins use GET /api/admin/clubs instead.
router.get(
   "/",
   requireRole(ROLES.STUDENT),
   validateQuery(listClubsQuerySchema),
   clubs.listClubs,
);
// Faculty and superAdmins can create clubs.
router.post(
   "/",
   requireRole(ROLES.FACULTY, ROLES.SUPER_ADMIN),
   validate(createClubBodySchema),
   clubs.createClub,
);
// SuperAdmin-only club governance.
router.patch(
   "/:slug/verification",
   requireRole(ROLES.SUPER_ADMIN),
   validate(verificationBodySchema),
   clubs.setVerification,
);
router.patch(
   "/:slug/status",
   requireRole(ROLES.SUPER_ADMIN),
   validate(statusBodySchema),
   clubs.setStatus,
);
router.get("/:slug", validateQuery(getClubQuerySchema), clubs.getClub);
// Edit a club — gated per-club on `club:edit` by requireClubPermission (coordinator/superAdmin implicit).
router.patch(
   "/:slug",
   requireClubPermission("club", "edit"),
   validate(updateClubBodySchema),
   clubs.updateClub,
);
// Delete a club — superAdmin only.
router.delete("/:slug", requireRole(ROLES.SUPER_ADMIN), clubs.deleteClub);
router.post("/:slug/join", clubs.joinClub);
router.delete("/:slug/membership", clubs.leaveClub);
// Following is students-only and needs no approval — it just subscribes you to the
// club's public announcements.
router.post("/:slug/follow", clubs.followClub);
router.delete("/:slug/follow", clubs.unfollowClub);

// ============================================================================
//  MEMBERS + COORDINATORS  (controllers/clubs/members.controller)
// ============================================================================
// SuperAdmin-only faculty assignment.
router.post(
   "/:slug/coordinators",
   requireRole(ROLES.SUPER_ADMIN),
   validate(addCoordinatorBodySchema),
   clubs.addCoordinator,
);
router.delete(
   "/:slug/coordinators/:userId",
   requireRole(ROLES.SUPER_ADMIN),
   clubs.removeCoordinator,
);
router.get(
   "/:slug/members/stats",
   requireClubPermission("members", "moderate"),
   clubs.getMemberStats,
);
// Find active students to add (picker) — moderation-gated like the rest.
router.get(
   "/:slug/members/search",
   requireClubPermission("members", "moderate"),
   validateQuery(searchMembersQuerySchema),
   clubs.searchAddableStudents,
);
router.get(
   "/:slug/members",
   validateQuery(listMembersQuerySchema),
   clubs.listMembers,
);
// Directly add a student as an approved member (no join request needed).
router.post(
   "/:slug/members",
   requireClubPermission("members", "moderate"),
   validate(addMemberBodySchema),
   clubs.addMember,
);
// Member admin: status (approve/reject) and role (promote/demote) are separate operations.
router.patch(
   "/:slug/members/:userId/status",
   requireClubPermission("members", "moderate"),
   validate(memberStatusBodySchema),
   clubs.moderateMember,
);
router.patch(
   "/:slug/members/:userId/role",
   requireClubPermission("members", "assign-role"),
   validate(memberRoleBodySchema),
   clubs.setMemberRole,
);
router.delete(
   "/:slug/members/:userId",
   requireClubPermission("members", "moderate"),
   clubs.removeMember,
);

// ============================================================================
//  ROLES  (controllers/clubs/roles.controller)
// ============================================================================
// Listing is open to any viewer (drives badges + filters); create/edit/delete are gated
// per-club on `roles:manage` by requireClubPermission.
router.get("/:slug/roles", clubs.listRoles);
router.post(
   "/:slug/roles",
   requireClubPermission("roles", "manage"),
   validate(createRoleBodySchema),
   clubs.createRole,
);
router.patch(
   "/:slug/roles/:roleSlug",
   requireClubPermission("roles", "manage"),
   validate(updateRoleBodySchema),
   clubs.updateRole,
);
router.delete(
   "/:slug/roles/:roleSlug",
   requireClubPermission("roles", "manage"),
   clubs.deleteRole,
);

// ============================================================================
//  ANNOUNCEMENTS  (controllers/announcements)
// ============================================================================
// Reading is gated in the controller, which knows whether the caller is a member:
// members see the whole board, everyone else only its public notices. Writes:
//   announcements:create → post, and take your own note down
//   announcements:pin    → pin / unpin
//   announcements:delete → take anyone's note down
router.get(
   "/:slug/announcements",
   validateQuery(listAnnouncementsQuerySchema),
   announcements.listClubAnnouncements,
);
router.post(
   "/:slug/announcements",
   requireClubPermission("announcements", "create"),
   validate(createAnnouncementBodySchema),
   announcements.createAnnouncement,
);
router.patch(
   "/:slug/announcements/:id/pin",
   requireClubPermission("announcements", "pin"),
   validate(pinAnnouncementBodySchema),
   announcements.setAnnouncementPinned,
);
// Either permission reaches the handler: create covers your own note, delete covers
// anyone's. deleteAnnouncement decides which of the two the caller actually needs.
router.delete(
   "/:slug/announcements/:id",
   requireAnyClubPermission(
      ["announcements", "create"],
      ["announcements", "delete"],
   ),
   announcements.deleteAnnouncement,
);

// ============================================================================
//  EVENTS  (controllers/events)
// ============================================================================
// Listing is open to any viewer (drafts are filtered out for non-managers by the
// controller). The rest are gated per-club by requireClubPermission:
//   events:create → create   events:edit    → edit, attendee roster
//   events:publish → publish  events:cancel → cancel, delete a draft
router.get(
   "/:slug/events",
   validateQuery(listEventsQuerySchema),
   events.listClubEvents,
);
router.post(
   "/:slug/events",
   requireClubPermission("events", "create"),
   validate(createEventBodySchema),
   events.createEvent,
);
router.patch(
   "/:slug/events/:eventId",
   requireClubPermission("events", "edit"),
   validate(updateEventBodySchema),
   events.updateEvent,
);
// One route, two transitions with their own permissions — events:publish to take a
// draft live, events:cancel to call one off. The body has to be parsed before the gate
// can pick which permission to demand, so validate runs first.
function requireStatusPermission(req, res, next) {
   const action = req.body.status === "cancelled" ? "cancel" : "publish";
   return requireClubPermission("events", action)(req, res, next);
}
router.patch(
   "/:slug/events/:eventId/status",
   validate(eventStatusBodySchema),
   requireStatusPermission,
   events.setEventStatus,
);
router.delete(
   "/:slug/events/:eventId",
   requireClubPermission("events", "cancel"),
   events.deleteEvent,
);
// Who signed up — the roster behind one event.
router.get(
   "/:slug/events/:eventId/attendees",
   requireClubPermission("events", "edit"),
   validateQuery(listAttendeesQuerySchema),
   events.listAttendees,
);

module.exports = router;
