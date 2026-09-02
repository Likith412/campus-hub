// Profile dashboard controller — the lazily-loaded read-only tabs (overview stats, activity,
// heatmap, clubs, achievements). Some are placeholders until their backing models land.
const { successResponse } = require("../../utils/response");
const {
   User,
   ClubMembership,
   ClubFollow,
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

// The fields a club card needs, shared by both halves of getClubs.
const CLUB_CARD_FIELDS =
   "name slug logoUrl stats.memberCount category coverFrom coverTo verified status tagline";

// GET /profile/me/clubs?relation=member|following|all — drives the Clubs tab and the
// My Clubs page. Defaults to memberships, so existing callers (the club switcher) are
// unaffected by the follow half.
async function getClubs(req, res) {
   const relation = req.validatedQuery?.relation || "member";

   const memberships = relation === "following" ? [] : await ClubMembership.find({
      userId: req.user._id,
      status: "approved",
   })
      .populate({
         path: "clubId",
         model: Club,
         select: CLUB_CARD_FIELDS,
      })
      .populate({ path: "roleId", select: "slug name" })
      .lean();

   const card = (c) => ({
      clubId: c._id,
      name: c.name,
      slug: c.slug,
      category: c.category,
      tagline: c.tagline || null,
      logoUrl: c.logoUrl,
      coverFrom: c.coverFrom,
      coverTo: c.coverTo,
      verified: !!c.verified,
      memberCount: c.stats?.memberCount || 0,
   });

   const items = memberships
      // Skip orphaned rows (club deleted) and clubs that aren't active (suspended/archived).
      .filter((m) => m.clubId && m.clubId.status === "active")
      .map((m) => ({
         ...card(m.clubId),
         relation: "member",
         role: m.roleId?.slug || null,
         roleName: m.roleId?.name || null,
         engagementScore: m.engagementScore,
         joinedAt: m.joinedAt,
      }));

   if (relation === "member") {
      return successResponse(res, 200, "Clubs", { items, count: items.length });
   }

   // Following a club you're already in tells you nothing new — membership is wider.
   const memberIds = new Set(items.map((i) => String(i.clubId)));
   const follows = await ClubFollow.find({ userId: req.user._id })
      .populate({ path: "clubId", model: Club, select: CLUB_CARD_FIELDS })
      .sort({ createdAt: -1 })
      .lean();

   const followed = follows
      .filter(
         (f) =>
            f.clubId &&
            f.clubId.status === "active" &&
            !memberIds.has(String(f.clubId._id)),
      )
      .map((f) => ({
         ...card(f.clubId),
         relation: "following",
         role: null,
         roleName: null,
         followedAt: f.createdAt,
      }));

   const all = relation === "following" ? followed : [...items, ...followed];
   return successResponse(res, 200, "Clubs", { items: all, count: all.length });
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
