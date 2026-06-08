// Clubs routes mounted at /api/clubs. All routes are authenticated.
const express = require("express");

const clubs = require("../controllers/clubs");
const authenticate = require("../middlewares/authenticate");
const requireRole = require("../middlewares/requireRole");
const requireClubPermission = require("../middlewares/requireClubPermission");
const validate = require("../middlewares/validate");
const { validateQuery } = require("../middlewares/validate");
const { ROLES } = require("../constants/roles");
const {
   listClubsQuerySchema,
   listMembersQuerySchema,
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
router.get("/:slug", clubs.getClub);
// Edit a club — gated per-club on `club:edit` by requireClubPermission (coordinator/superAdmin implicit).
router.patch(
   "/:slug",
   requireClubPermission("club", "edit"),
   validate(updateClubBodySchema),
   clubs.updateClub,
);
// Delete a club — superAdmin or the creating faculty (enforced in the controller).
router.delete(
   "/:slug",
   requireRole(ROLES.FACULTY, ROLES.SUPER_ADMIN),
   clubs.deleteClub,
);
router.post("/:slug/join", clubs.joinClub);
router.delete("/:slug/membership", clubs.leaveClub);

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
router.get(
   "/:slug/members",
   validateQuery(listMembersQuerySchema),
   clubs.listMembers,
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

module.exports = router;
