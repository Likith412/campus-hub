// Profile controller — backs the Profile & Settings page.
// Each endpoint maps to one slice of the design (header, stats, skills, clubs, preferences,
// sessions, danger zone) so the frontend can load tabs lazily instead of fetching everything
// up front.
const { successResponse } = require("../utils/response");
const { NotFoundError, ConflictError } = require("../utils/errors");
const { User, ClubMembership, Club } = require("../models");
const { ROLES } = require("../constants/roles");

// Resolve the role discriminator model so writes cast/validate against the subtype's
// schema (the base User schema doesn't know subtype paths like profile.designation).
const modelFor = (u) => User.discriminators?.[u.role] || User;

// Shape the user record for public consumption. Strips sensitive fields and flattens some nested ones.
function publicProfile(u) {
   return {
      id: u._id,
      email: u.email,
      name: u.name,
      username: u.username,
      phone: u.phone,
      avatarUrl: u.avatarUrl,
      coverUrl: u.coverUrl,
      role: u.role,
      profile: u.profile,
      interests: u.interests,
      emailVerified: u.emailVerified,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
   };
}

// Computes profile completion percentage for the progress bar.
function computeCompletion(u) {
   // Coordinators have a faculty-shaped profile — score the fields that apply to them.
   const checks =
      u.role === ROLES.COORDINATOR
         ? [
              !!u.name,
              !!u.avatarUrl,
              !!u.profile?.bio,
              !!u.profile?.department,
              !!u.profile?.designation,
              !!u.profile?.officeLocation,
              !!u.profile?.linkedinUrl,
              (u.profile?.expertise || []).length > 0,
           ]
         : [
              !!u.name,
              !!u.username,
              !!u.avatarUrl,
              !!u.coverUrl,
              !!u.profile?.bio,
              !!u.profile?.department,
              !!u.profile?.year,
              !!u.profile?.linkedinUrl,
              !!u.profile?.githubUrl,
              !!u.profile?.portfolioUrl,
              (u.skills || []).length > 0,
              (u.interests || []).length > 0,
           ];
   const done = checks.filter(Boolean).length;
   return Math.round((done / checks.length) * 100);
}

// GET /profile/me — header data only. Cheap, called on every Profile page mount.
async function getMe(req, res) {
   const user = await User.findById(req.user._id).lean();
   if (!user) throw new NotFoundError("User not found");
   return successResponse(res, 200, "Profile", {
      user: publicProfile(user),
      completion: computeCompletion(user),
   });
}

// PATCH /profile/me — account form. Sparse update: only fields present in the body are touched.
async function updateMe(req, res) {
   const updates = req.body;

   if (updates.username) {
      const taken = await User.exists({
         username: updates.username,
         _id: { $ne: req.user._id },
      });
      if (taken) throw new ConflictError("Username already taken");
   }

   // Mongo $set with dotted keys so we don't blow away sibling fields inside `profile`.
   const $set = {};
   for (const [k, v] of Object.entries(updates)) {
      if (k === "profile" && v && typeof v === "object") {
         for (const [pk, pv] of Object.entries(v)) $set[`profile.${pk}`] = pv;
      } else {
         $set[k] = v;
      }
   }

   const user = await modelFor(req.user).findByIdAndUpdate(
      req.user._id,
      { $set },
      { returnDocument: "after", runValidators: true },
   ).lean();

   return successResponse(res, 200, "Profile updated", {
      user: publicProfile(user),
      completion: computeCompletion(user),
   });
}

// GET /profile/me/stats — the four stat cards across the top of the overview tab.
async function getStats(req, res) {
   const user = await User.findById(req.user._id, "stats").lean();
   return successResponse(res, 200, "Stats", { stats: user?.stats || {} });
}

// GET /profile/me/skills
async function getSkills(req, res) {
   const user = await User.findById(req.user._id, "skills").lean();
   return successResponse(res, 200, "Skills", { skills: user?.skills || [] });
}

// PUT /profile/me/skills — replaces the full list. Frontend re-sends every row after edit.
async function updateSkills(req, res) {
   const user = await modelFor(req.user).findByIdAndUpdate(
      req.user._id,
      { $set: { skills: req.body.skills } },
      { returnDocument: "after", runValidators: true },
   ).lean();
   return successResponse(res, 200, "Skills updated", { skills: user.skills });
}

// GET /profile/me/recent-activity — placeholder until the Activity model lands.
// Returns an empty list with the shape the UI expects so the page renders without errors.
async function getRecentActivity(req, res) {
   return successResponse(res, 200, "Recent activity", { items: [] });
}

// GET /profile/me/heatmap?range=6m — contribution grid. Same stub story as recent-activity.
async function getHeatmap(req, res) {
   return successResponse(res, 200, "Activity heatmap", {
      buckets: [],
      totalContributions: 0,
      longestStreak: req.user?.stats?.longestStreak || 0,
   });
}

// GET /profile/me/clubs — drives the Clubs tab. Joins memberships → clubs in one round trip.
async function getClubs(req, res) {
   const memberships = await ClubMembership.find({
      userId: req.user._id,
      status: "approved",
   })
      .populate({
         path: "clubId",
         model: Club,
         select: "name slug logoUrl stats.memberCount category coverFrom coverTo verified",
      })
      .lean();

   const items = memberships
      .filter((m) => m.clubId) // Skip orphaned rows where the club was deleted.
      .map((m) => ({
         clubId: m.clubId._id,
         name: m.clubId.name,
         slug: m.clubId.slug,
         category: m.clubId.category,
         logoUrl: m.clubId.logoUrl,
         coverFrom: m.clubId.coverFrom,
         coverTo: m.clubId.coverTo,
         verified: !!m.clubId.verified,
         memberCount: m.clubId.stats?.memberCount || 0,
         role: m.role,
         engagementScore: m.engagementScore,
         joinedAt: m.joinedAt,
      }));

   return successResponse(res, 200, "Clubs", { items, count: items.length });
}

// GET /profile/me/achievements/summary — count + CTA target for the Achievements tab.
// Detail listing lives on the Certificates page; here we just need the rollup.
async function getAchievementsSummary(req, res) {
   const user = await User.findById(req.user._id, "stats").lean();
   return successResponse(res, 200, "Achievements", {
      count: user?.stats?.certificatesCount || 0,
   });
}

// GET /profile/me/preferences — every toggle on the Settings page.
async function getPreferences(req, res) {
   const user = await User.findById(req.user._id, "preferences").lean();
   return successResponse(res, 200, "Preferences", {
      preferences: user?.preferences || {},
   });
}

// PATCH /profile/me/preferences — partial update of nested toggle groups (notifications, privacy).
async function updatePreferences(req, res) {
   const $set = {};
   const flatten = (prefix, obj) => {
      for (const [k, v] of Object.entries(obj)) {
         if (v && typeof v === "object" && !Array.isArray(v)) {
            flatten(`${prefix}.${k}`, v);
         } else {
            $set[`${prefix}.${k}`] = v;
         }
      }
   };
   flatten("preferences", req.body);

   const user = await modelFor(req.user).findByIdAndUpdate(
      req.user._id,
      { $set },
      { returnDocument: "after", runValidators: true },
   ).lean();
   return successResponse(res, 200, "Preferences updated", {
      preferences: user.preferences,
   });
}

module.exports = {
   getMe,
   updateMe,
   getStats,
   getSkills,
   updateSkills,
   getRecentActivity,
   getHeatmap,
   getClubs,
   getAchievementsSummary,
   getPreferences,
   updatePreferences,
};
