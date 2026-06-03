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
   updateMemberBodySchema,
   createClubBodySchema,
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
router.post("/:slug/join", clubs.joinClub);
router.delete("/:slug/membership", clubs.leaveClub);

router.get(
   "/:slug/members",
   validateQuery(listMembersQuerySchema),
   clubs.listMembers,
);
router.patch(
   "/:slug/members/:userId",
   validate(updateMemberBodySchema),
   clubs.updateMember,
);
router.delete("/:slug/members/:userId", clubs.removeMember);

module.exports = router;
