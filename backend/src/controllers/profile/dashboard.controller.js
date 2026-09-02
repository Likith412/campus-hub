// Profile dashboard controller — the lazily-loaded read-only tabs (overview stats, activity,
// heatmap, clubs, achievements). Some are placeholders until their backing models land.
const { successResponse } = require("../../utils/response");
const {
   User,
   ClubMembership,
   Club,
   EventRegistration,
} = require("../../models");

// GET /profile/me/stats — the four stat cards across the top of the overview tab.
// eventsRegistered is counted live off the registrations; the rest are still stored
// placeholders waiting on their own features.
async function getStats(req, res) {
   const [user, eventsRegistered] = await Promise.all([
      User.findById(req.user._id, "stats").lean(),
      EventRegistration.countDocuments({
         userId: req.user._id,
         status: "registered",
      }),
   ]);
   return successResponse(res, 200, "Stats", {
      stats: { ...(user?.stats || {}), eventsRegistered },
   });
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
         select: "name slug logoUrl stats.memberCount category coverFrom coverTo verified status",
      })
      .populate({ path: "roleId", select: "slug" })
      .lean();

   const items = memberships
      // Skip orphaned rows (club deleted) and clubs that aren't active (suspended/archived).
      .filter((m) => m.clubId && m.clubId.status === "active")
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
         role: m.roleId?.slug || null,
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

module.exports = {
   getStats,
   getRecentActivity,
   getHeatmap,
   getClubs,
   getAchievementsSummary,
};
