// Profile routes mounted at /api/profile. Every route is authenticated — the profile page
// only loads after login. Endpoints are sliced per tab so the frontend can fetch lazily.
const express = require("express");

const profile = require("../controllers/profile");
const authenticate = require("../middlewares/authenticate");
const validate = require("../middlewares/validate");
const {
   updateProfileSchema,
   updateSkillsSchema,
   updatePreferencesSchema,
   changePasswordSchema,
} = require("../validators/profile");

const router = express.Router();
router.use(authenticate);

// Hero / account
router.get("/me", profile.getMe);
router.patch("/me", validate(updateProfileSchema), profile.updateMe);

// Overview tab
router.get("/me/stats", profile.getStats);
router.get("/me/recent-activity", profile.getRecentActivity); // Pending. Need to develop.
router.get("/me/heatmap", profile.getHeatmap); // Pending. Need to develop.

// Skills
router.get("/me/skills", profile.getSkills);
router.put("/me/skills", validate(updateSkillsSchema), profile.updateSkills);

// Clubs & achievements tabs
router.get("/me/clubs", profile.getClubs);
router.get("/me/achievements/summary", profile.getAchievementsSummary);

// Settings: preferences
router.get("/me/preferences", profile.getPreferences);
router.patch(
   "/me/preferences",
   validate(updatePreferencesSchema),
   profile.updatePreferences,
);

// Settings: password
router.post(
   "/me/change-password",
   validate(changePasswordSchema),
   profile.changePassword,
);

// Settings: sessions & devices
router.get("/me/sessions", profile.getSessions);
router.delete("/me/sessions/:id", profile.revokeSession);
router.post("/me/sessions/revoke-others", profile.revokeOtherSessions);

// Danger zone
router.get("/me/export", profile.exportData);
router.delete("/me", profile.deleteAccount); // Pending. Need to develop background job for this.

module.exports = router;
