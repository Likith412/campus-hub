// Profile controller — backs the Profile & Settings page.
// Each endpoint maps to one slice of the design (header, stats, skills, clubs, preferences,
// sessions, danger zone) so the frontend can load tabs lazily instead of fetching everything
// up front.
const { successResponse } = require("../utils/response");
const { hashPassword, verifyPassword } = require("../utils/password");
const { sha256 } = require("../utils/tokens");
const {
   NotFoundError,
   UnauthorizedError,
   ConflictError,
} = require("../utils/errors");
const { REFRESH_COOKIE_NAME } = require("../utils/cookies");
const { blacklistSessionAccess } = require("../utils/sessionRevocation");
const { User, AuthSession, ClubMembership, Club } = require("../models");

// Resolve which AuthSession matches the caller's refresh cookie.
async function findCurrentSession(req) {
   const token = req.cookies?.[REFRESH_COOKIE_NAME];
   if (!token) return null;
   return AuthSession.findOne({
      userId: req.user._id,
      refreshTokenHash: sha256(token),
      revokedAt: null,
      expiresAt: { $gt: new Date() },
   }).lean();
}

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
   const checks = [
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

   const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set },
      { new: true, runValidators: true },
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
   const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: { skills: req.body.skills } },
      { new: true, runValidators: true },
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
         select: "name slug logoUrl stats.memberCount category",
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

   const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set },
      { new: true, runValidators: true },
   ).lean();
   return successResponse(res, 200, "Preferences updated", {
      preferences: user.preferences,
   });
}

// POST /profile/me/change-password — authenticated password change.
// Revokes all other sessions so old refresh tokens can't outlive the change.
async function changePassword(req, res) {
   const { currentPassword, newPassword } = req.body;
   const user = await User.findById(req.user._id);
   if (!user) throw new NotFoundError("User not found");

   const ok = await verifyPassword(currentPassword, user.passwordHash);
   if (!ok) throw new UnauthorizedError("Current password is incorrect");

   user.passwordHash = await hashPassword(newPassword);
   await user.save();

   // Keep the current session alive; revoke everything else + kill their access JWTs now.
   const current = await findCurrentSession(req);
   const filter = {
      userId: user._id,
      revokedAt: null,
      ...(current ? { _id: { $ne: current._id } } : {}),
   };
   const others = await AuthSession.find(filter, "_id").lean();
   await blacklistSessionAccess(others.map((s) => s._id));
   await AuthSession.updateMany(filter, { revokedAt: new Date() });

   return successResponse(res, 200, "Password changed");
}

// GET /profile/me/sessions — list active sessions for the Sessions & devices panel.
async function getSessions(req, res) {
   const current = await findCurrentSession(req);

   const sessions = await AuthSession.find({
      userId: req.user._id,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
   })
      .sort({ updatedAt: -1 })
      .lean();

   const items = sessions.map((s) => {
      const d = s.deviceInfo || {};
      // Composed strings the UI renders verbatim.
      const browserLabel = [d.browser, d.browserVersion?.split(".")[0]]
         .filter(Boolean)
         .join(" ");
      const deviceLabel =
         [d.deviceVendor, d.deviceModel].filter(Boolean).join(" ") ||
         d.os ||
         "Unknown device";
      const locationLabel = [d.city, d.region, d.country]
         .filter(Boolean)
         .join(", ");
      return {
         id: s._id,
         ip: d.ip,
         deviceLabel,
         browserLabel,
         locationLabel,
         deviceType: d.deviceType,
         isCurrent: !!current && String(s._id) === String(current._id),
         createdAt: s.createdAt,
         lastActiveAt: s.updatedAt,
         expiresAt: s.expiresAt,
      };
   });

   return successResponse(res, 200, "Sessions", { items });
}

// DELETE /profile/me/sessions/:id — revoke a single session.
async function revokeSession(req, res) {
   const session = await AuthSession.findOne({
      _id: req.params.id,
      userId: req.user._id,
   });
   if (!session) throw new NotFoundError("Session not found");

   // Use /auth/logout to end the current session — this endpoint is for other devices only.
   const current = await findCurrentSession(req);
   if (current && String(session._id) === String(current._id)) {
      throw new ConflictError("Use logout to end the current session");
   }

   await blacklistSessionAccess([session._id]);
   session.revokedAt = new Date();
   await session.save();
   return successResponse(res, 200, "Session revoked");
}

// POST /profile/me/sessions/revoke-others — "Sign out everywhere else" button.
async function revokeOtherSessions(req, res) {
   const current = await findCurrentSession(req);
   const filter = {
      userId: req.user._id,
      revokedAt: null,
      ...(current ? { _id: { $ne: current._id } } : {}),
   };
   const others = await AuthSession.find(filter, "_id").lean();
   await blacklistSessionAccess(others.map((s) => s._id));
   const result = await AuthSession.updateMany(filter, {
      revokedAt: new Date(),
   });
   return successResponse(res, 200, "Other sessions revoked", {
      revokedCount: result.modifiedCount,
   });
}

// DELETE /profile/me — soft delete. Sessions revoked, passwordHash scrubbed, deletedAt set.
// A background job can hard-delete after the retention window.
async function deleteAccount(req, res) {
   await User.updateOne(
      { _id: req.user._id },
      {
         $set: {
            deletedAt: new Date(),
            isActive: false,
            passwordHash: "deleted",
         },
      },
   );
   const active = await AuthSession.find(
      { userId: req.user._id, revokedAt: null },
      "_id",
   ).lean();
   await blacklistSessionAccess(active.map((s) => s._id));
   await AuthSession.updateMany(
      { userId: req.user._id, revokedAt: null },
      { revokedAt: new Date() },
   );
   return successResponse(res, 200, "Account deleted");
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
   changePassword,
   getSessions,
   revokeSession,
   revokeOtherSessions,
   deleteAccount,
};
