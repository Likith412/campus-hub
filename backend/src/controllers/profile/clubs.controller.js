// The clubs behind the profile's Clubs tab and the My Clubs page.
const { successResponse, pageMeta } = require("../../utils/response");
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
   const {
      relation = "member",
      q,
      category,
      sort = "recent",
      page = 1,
      limit,
   } = req.validatedQuery || {};

   // Always resolved: the Following tab needs these to know which clubs to leave out.
   // Following a club you have since joined tells you nothing new — membership is wider.
   const membershipQuery = ClubMembership.find({
      userId: req.user._id,
      status: "approved",
   }).populate({
      path: "clubId",
      model: Club,
      select: CLUB_CARD_FIELDS,
   });
   // The role is a member-row field; the Following tab never prints one.
   if (relation !== "following") {
      membershipQuery.populate({ path: "roleId", select: "slug name" });
   }
   const memberships = await membershipQuery.lean();

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

   // Filtering and ordering happen here rather than in the queries: joinedAt/followedAt
   // live on the membership and follow rows, and the two lists are merged after the fact,
   // so no single query can order the combined set. These lists are a handful long.
   const respond = (rows) => {
      let all = rows;
      if (category) all = all.filter((c) => c.category === category);
      if (q) {
         const needle = q.toLowerCase();
         all = all.filter(
            (c) =>
               c.name.toLowerCase().includes(needle) ||
               (c.tagline || "").toLowerCase().includes(needle),
         );
      }
      const at = (c) => new Date(c.joinedAt || c.followedAt || 0).getTime();
      all = [...all].sort((a, b) => {
         if (sort === "name") return a.name.localeCompare(b.name);
         if (sort === "members") return b.memberCount - a.memberCount;
         return at(b) - at(a);
      });

      // No limit means no paging — the club switcher reads the whole list.
      const paged = limit ? all.slice((page - 1) * limit, page * limit) : all;
      return successResponse(res, 200, "Clubs", {
         items: paged,
         pagination: pageMeta(page, limit || all.length, all.length, paged.length),
      });
   };

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

   if (relation === "member") return respond(items);

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

   return respond(relation === "following" ? followed : [...items, ...followed]);
}

module.exports = { getClubs };
