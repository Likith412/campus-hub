// The clubs behind the profile's Clubs tab and the My Clubs page.
const { successResponse } = require("../../utils/response");
const {
   ClubMembership,
   ClubFollow,
   Club,
} = require("../../models");

// The fields a club card needs, shared by both halves of getClubs.
const CLUB_CARD_FIELDS =
   "name slug stats.memberCount category coverFrom coverTo verified status tagline";

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

module.exports = { getClubs };
