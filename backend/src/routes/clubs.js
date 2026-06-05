// Clubs routes mounted at /api/clubs.
const express = require("express");

const clubs = require("../controllers/clubs");
const authenticate = require("../middlewares/authenticate");
const requireRole = require("../middlewares/requireRole");
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
} = require("../validators/clubs");

const router = express.Router();
router.use(authenticate);

router.get("/", validateQuery(listClubsQuerySchema), clubs.listClubs);
// Coordinators and superAdmins can create clubs.
router.post(
   "/",
   requireRole(ROLES.COORDINATOR, ROLES.SUPER_ADMIN),
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
// Edit a club — gated per-club (coordinator of this club or superAdmin) inside the controller.
router.patch(
   "/:slug",
   requireRole(ROLES.COORDINATOR, ROLES.SUPER_ADMIN),
   validate(updateClubBodySchema),
   clubs.updateClub,
);
router.post("/:slug/join", clubs.joinClub);
router.delete("/:slug/membership", clubs.leaveClub);

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
   "/:slug/members",
   validateQuery(listMembersQuerySchema),
   clubs.listMembers,
);
// Member admin: status (approve/reject) and role (promote/demote) are separate operations.
router.patch(
   "/:slug/members/:userId/status",
   requireRole(ROLES.COORDINATOR, ROLES.SUPER_ADMIN),
   validate(memberStatusBodySchema),
   clubs.moderateMember,
);
router.patch(
   "/:slug/members/:userId/role",
   requireRole(ROLES.COORDINATOR, ROLES.SUPER_ADMIN),
   validate(memberRoleBodySchema),
   clubs.setMemberRole,
);
router.delete(
   "/:slug/members/:userId",
   requireRole(ROLES.COORDINATOR, ROLES.SUPER_ADMIN),
   clubs.removeMember,
);

module.exports = router;
