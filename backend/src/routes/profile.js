// Profile routes mounted at /api/profile. Every route is authenticated — the profile page only
// loads after login. The account-security routes (password change, sessions, deletion) live in
// routes/accountSecurity.js even though they sit under /profile/me.
const express = require("express");

const profile = require("../controllers/profile");
const authenticate = require("../middlewares/authenticate");
const requireRole = require("../middlewares/requireRole");
const { ROLES } = require("../constants/roles");
const validate = require("../middlewares/validate");
const { validateQuery } = require("../middlewares/validate");
const {
   updateProfileSchema,
   updateSkillsSchema,
   listProfileEventsQuerySchema,
   listMyClubsQuerySchema,
} = require("../validators/profile");

const router = express.Router();
router.use(authenticate);

// ============================================================================
//  PROFILE — hero / account  (controllers/profile/profile.controller)
// ============================================================================
router.get("/me", profile.getMe);
router.patch("/me", validate(updateProfileSchema), profile.updateMe);
// Dashboard headline counts — deliberately separate from the profile payload,
// which is far heavier than three numbers warrant.
router.get("/me/stats", profile.getMyStats);

// ============================================================================
//  CLUBS  (controllers/profile/clubs.controller)
// ============================================================================
router.get(
   "/me/clubs",
   validateQuery(listMyClubsQuerySchema),
   profile.getClubs,
);

// ============================================================================
//  SKILLS  (controllers/profile/skills.controller)
// ============================================================================
// Students only — `skills` lives on the student discriminator, so a faculty write
// would be stripped by Mongoose and still answer 200.
router.get("/me/skills", requireRole(ROLES.STUDENT), profile.getSkills);
router.put(
   "/me/skills",
   requireRole(ROLES.STUDENT),
   validate(updateSkillsSchema),
   profile.updateSkills,
);

// ============================================================================
//  PUBLIC PROFILE — anyone's profile by username or id  (publicProfile.controller)
//  Declared last: ":handle" is a single segment, so it can't shadow the /me routes.
// ============================================================================
router.get("/:handle", profile.getPublicProfile);
router.get(
   "/:handle/events",
   validateQuery(listProfileEventsQuerySchema),
   profile.listProfileEvents,
);

module.exports = router;
