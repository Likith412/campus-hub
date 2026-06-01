// Clubs routes mounted at /api/clubs.
const express = require("express");

const clubs = require("../controllers/clubs");
const authenticate = require("../middlewares/authenticate");
const validate = require("../middlewares/validate");
const { validateQuery } = require("../middlewares/validate");
const {
   listClubsQuerySchema,
   listMembersQuerySchema,
   updateMemberBodySchema,
} = require("../validators/clubs");

const router = express.Router();
router.use(authenticate);

router.get("/", validateQuery(listClubsQuerySchema), clubs.listClubs);
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
