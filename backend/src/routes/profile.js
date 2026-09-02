// Profile routes mounted at /api/profile. Every route is authenticated — the profile page only
// loads after login. The account-security routes (password change, sessions, deletion) live in
// routes/accountSecurity.js even though they sit under /profile/me.
const express = require("express");

const profile = require("../controllers/profile");
const authenticate = require("../middlewares/authenticate");
const validate = require("../middlewares/validate");
const { validateQuery } = require("../middlewares/validate");
const {
   updateProfileSchema,
   updateSkillsSchema,
   updatePreferencesSchema,
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

// ============================================================================
//  DASHBOARD — read-only tabs  (controllers/profile/dashboard.controller)
// ============================================================================
router.get("/me/stats", profile.getStats);
router.get("/me/recent-activity", profile.getRecentActivity); // Pending. Need to develop.
router.get("/me/heatmap", profile.getHeatmap); // Pending. Need to develop.
router.get(
   "/me/clubs",
   validateQuery(listMyClubsQuerySchema),
   profile.getClubs,
);
router.get("/me/achievements/summary", profile.getAchievementsSummary);

// ============================================================================
//  SKILLS  (controllers/profile/skills.controller)
// ============================================================================
router.get("/me/skills", profile.getSkills);
router.put("/me/skills", validate(updateSkillsSchema), profile.updateSkills);

// ============================================================================
//  PREFERENCES  (controllers/profile/preferences.controller)
// ============================================================================
router.get("/me/preferences", profile.getPreferences);
router.patch(
   "/me/preferences",
   validate(updatePreferencesSchema),
   profile.updatePreferences,
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
