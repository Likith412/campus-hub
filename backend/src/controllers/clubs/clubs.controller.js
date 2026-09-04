// Clubs controller — browse, lifecycle, join/leave.
// Membership lifecycle: open=instant approved, request=pending, invite=admin-driven.
const { successResponse, pageMeta } = require("../../utils/response");
const {
   NotFoundError,
   ForbiddenError,
   ConflictError,
   ValidationError,
} = require("../../utils/errors");
const {
   Club,
   ClubMembership,
   ClubRole,
   User,
   Event,
   EventRegistration,
   Announcement,
   ClubFollow,
} = require("../../models");
const { systemRoleDocs } = require("../../models/ClubRole");
const { ROLES } = require("../../constants/roles");
const { escapeRegex } = require("../../utils/escapeRegex");
const {
   CLUB_SORT,
   bumpClubStat,
   findClubBySlugFor,
   slugify,
   systemRoleId,
} = require("./helpers");
const { releaseSeats } = require("../events/helpers");

// Shape a club doc for the listing card.
// Exactly what publicClubCard reads — the browse list has no use for socialLinks or
// the full description-bearing document.
const CLUB_CARD_FIELDS =
   "slug name category tagline description coverFrom coverTo verified foundedYear tags stats settings";

// The rail reads five fields; no point selecting the description-bearing document.
const CLUB_COMPACT_FIELDS = "slug name coverFrom coverTo stats.memberCount";

// The sidebar rail: avatar colours, a name and a member count. No membership state —
// browse only ever returns clubs you are not in (see the `held` exclusion below).
function compactClubRow(c) {
   return {
      slug: c.slug,
      name: c.name,
      coverFrom: c.coverFrom,
      coverTo: c.coverTo,
      memberCount: c.stats?.memberCount ?? 0,
   };
}

function publicClubCard(c, followedIds = new Set()) {
   return {
      id: c._id,
      slug: c.slug,
      name: c.name,
      category: c.category,
      tagline: c.tagline,
      description: c.description,
      coverFrom: c.coverFrom,
      coverTo: c.coverTo,
      verified: !!c.verified,
      foundedYear: c.foundedYear,
      tags: c.tags || [],
      memberCount: c.stats?.memberCount ?? 0,
      eventCount: c.stats?.eventCount ?? 0,
      joinPolicy: c.settings?.joinPolicy || "request",
      isPrivate: !!c.settings?.isPrivate,
      // follow state for the current user (drives the follow button)
      isFollowing: followedIds.has(String(c._id)),
   };
}

// GET /api/clubs — paginated list with category counts and per-user membership state.
async function listClubs(req, res) {
   const { q, category, sort, verified, view, page, limit } = req.validatedQuery;
   const compact = view === "compact";
   const userId = req.user._id;

   // Student-only browse — always scoped to active clubs.
   const baseFilter = { status: "active" };
   if (verified === "true") baseFilter.verified = true;
   if (verified === "false") baseFilter.verified = false;
   const searchFilter = q
      ? {
           $or: [
              { name: { $regex: escapeRegex(q), $options: "i" } },
              { description: { $regex: escapeRegex(q), $options: "i" } },
              { tags: { $regex: escapeRegex(q), $options: "i" } },
           ],
        }
      : {};

   // Browse is for finding somewhere new. Clubs you're approved in or have a request
   // pending on drop out — your own list lives on /my-clubs — and so do clubs you were
   // removed from, which joinClub refuses outright. A club you left stays: you can rejoin.
   const held = await ClubMembership.find({
      userId,
      status: { $in: ["approved", "pending", "removed"] },
   })
      .select("clubId")
      .lean();
   if (held.length) baseFilter._id = { $nin: held.map((m) => m.clubId) };

   // A private club is unlisted: it never shows up in browse. Members reach it from
   // /my-clubs, and anyone with the link still gets the page.
   baseFilter["settings.isPrivate"] = { $ne: true };

   const filter = {
      ...baseFilter,
      ...searchFilter,
      ...(category ? { category } : {}),
   };

   const skip = (page - 1) * limit;
   const [items, total, countsAgg] = await Promise.all([
      Club.find(filter)
         .select(compact ? CLUB_COMPACT_FIELDS : CLUB_CARD_FIELDS)
         .sort(CLUB_SORT[sort] || CLUB_SORT.popular)
         .skip(skip)
         .limit(limit)
         .lean(),
      Club.countDocuments(filter),
      // Counts drive the browse page's category chips — the compact rail has none, so
      // it doesn't pay for the aggregation. They ignore the category filter (chips keep
      // showing full totals) but honor the search.
      compact
         ? []
         : Club.aggregate([
              { $match: { ...baseFilter, ...searchFilter } },
              { $group: { _id: "$category", n: { $sum: 1 } } },
           ]),
   ]);

   // Follow state for the page of clubs. The compact rail has no follow control, so it
   // skips this entirely.
   let followedIds = new Set();
   if (userId && items.length && !compact) {
      const follows = await ClubFollow.find({
         userId,
         clubId: { $in: items.map((i) => i._id) },
      })
         .select("clubId")
         .lean();
      followedIds = new Set(follows.map((f) => String(f.clubId)));
   }

   const categoryCounts = { all: 0 };
   for (const row of countsAgg) {
      categoryCounts[row._id] = row.n;
      categoryCounts.all += row.n;
   }

   return successResponse(res, 200, "Clubs", {
      items: items.map((c) =>
         compact ? compactClubRow(c) : publicClubCard(c, followedIds),
      ),
      ...(compact ? {} : { categoryCounts }),
      pagination: pageMeta(page, limit, total, items.length),
   });
}

// Find an unused slug, appending -2, -3, … on collision.
async function uniqueSlug(base) {
   const root = slugify(base) || "club";
   let slug = root;
   for (let n = 2; await Club.exists({ slug }); n++) slug = `${root}-${n}`;
   return slug;
}

// POST /api/clubs — faculty/superAdmin create a club. Live immediately; a superAdmin's
// club is verified on the spot, a faculty's starts unverified.
async function createClub(req, res) {
   const {
      name,
      category,
      tagline,
      description,
      tags,
      joinPolicy,
      isPrivate,
      socialLinks,
      coverFrom,
      coverTo,
      foundedYear,
   } = req.body;
   const isSuperAdmin = req.user.role === ROLES.SUPER_ADMIN;

   // Resolve who coordinates the new club:
   //  - coordinator creates → they are the sole coordinator (self-assigned).
   //  - superAdmin creates → must assign ≥1 active faculty (coordinator assignment is superAdmin-only).
   let coordinatorIds;
   if (isSuperAdmin) {
      const requested = [
         ...new Set((req.body.coordinatorIds || []).map(String)),
      ];
      if (requested.length === 0) {
         throw new ValidationError("Assign at least one coordinator");
      }
      const valid = await User.find({
         _id: { $in: requested },
         role: ROLES.FACULTY,
         isActive: true,
      })
         .select("_id")
         .lean();
      if (valid.length !== requested.length) {
         throw new ValidationError(
            "Coordinators must be active faculty accounts",
         );
      }
      coordinatorIds = valid.map((u) => u._id);
   } else {
      coordinatorIds = [req.user._id];
   }

   // slug is optional — fall back to the name, then de-duplicate on collision.
   const slug = await uniqueSlug(req.body.slug || name);

   const club = await Club.create({
      name,
      slug,
      category,
      tagline,
      description,
      tags: tags || [],
      socialLinks: socialLinks || {},
      coverFrom,
      coverTo,
      foundedYear,
      settings: { joinPolicy: joinPolicy || "request", isPrivate: !!isPrivate },
      status: "active",
      // superAdmin-created clubs are verified on the spot; faculty-created start unverified.
      verified: isSuperAdmin,
      createdBy: req.user._id,
      stats: { memberCount: coordinatorIds.length },
   });

   // Seed the two system roles (coordinator / member) this club's memberships key off.
   const roles = await ClubRole.insertMany(systemRoleDocs(club._id));
   const coordinatorRoleId = roles.find((r) => r.slug === "coordinator")._id;

   // Issue an approved coordinator membership for each assigned coordinator.
   const now = new Date();
   await ClubMembership.insertMany(
      coordinatorIds.map((userId) => ({
         userId,
         clubId: club._id,
         roleId: coordinatorRoleId,
         status: "approved",
         joinedAt: now,
      })),
   );

   return successResponse(res, 201, "Club created", {
      slug: club.slug,
      verified: !!club.verified,
   });
}

// PATCH /api/clubs/:slug — a club's coordinator (or superAdmin) edits its profile.
// Only the fields present in the body are touched; slug and verification are not editable here.
async function updateClub(req, res) {
   const club = req.club; // resolved + club:edit asserted by requireClubPermission

   const b = req.body;
   // Dotted $set so nested settings/socialLinks don't clobber sibling keys (e.g. allowGuests).
   const $set = {};
   for (const f of [
      "name",
      "tagline",
      "description",
      "category",
      "coverFrom",
      "coverTo",
      "foundedYear",
      "tags",
   ]) {
      if (b[f] !== undefined) $set[f] = b[f];
   }
   if (b.settings?.joinPolicy !== undefined) {
      $set["settings.joinPolicy"] = b.settings.joinPolicy;
   }
   if (b.settings?.isPrivate !== undefined) {
      $set["settings.isPrivate"] = b.settings.isPrivate;
   }
   if (b.socialLinks !== undefined) {
      for (const k of ["website", "instagram", "linkedin"]) {
         if (b.socialLinks[k] !== undefined) {
            $set[`socialLinks.${k}`] = b.socialLinks[k];
         }
      }
   }

   await Club.updateOne({ _id: club._id }, { $set }, { runValidators: true });

   return successResponse(res, 200, "Club updated", { slug: club.slug });
}

// PATCH /api/clubs/:slug/verification — superAdmin flips the ✓ verified badge.
async function setVerification(req, res) {
   const club = await Club.findOne({ slug: req.params.slug });
   if (!club) throw new NotFoundError("Club not found");
   club.verified = req.body.verified;
   await club.save();
   return successResponse(res, 200, "Verification updated", {
      verified: club.verified,
   });
}

// PATCH /api/clubs/:slug/status — superAdmin suspends/archives/reactivates a club.
async function setStatus(req, res) {
   const club = await Club.findOne({ slug: req.params.slug });
   if (!club) throw new NotFoundError("Club not found");
   club.status = req.body.status;
   await club.save();
   return successResponse(res, 200, "Status updated", { status: club.status });
}

// DELETE /api/clubs/:slug — permanently delete a club + its memberships, roles, and events.
// SuperAdmin-only (enforced at the route).
async function deleteClub(req, res) {
   const club = await Club.findOne({ slug: req.params.slug }).select("_id");
   if (!club) throw new NotFoundError("Club not found");

   // Cascade: drop memberships, follows, roles, announcements, and events before the
   // club itself. Registrations hang off the events, so they're collected by id first.
   const eventIds = await Event.find({ clubId: club._id }).distinct("_id");
   await Promise.all([
      ClubMembership.deleteMany({ clubId: club._id }),
      ClubFollow.deleteMany({ clubId: club._id }),
      ClubRole.deleteMany({ clubId: club._id }),
      Announcement.deleteMany({ clubId: club._id }),
      EventRegistration.deleteMany({ eventId: { $in: eventIds } }),
      Event.deleteMany({ clubId: club._id }),
   ]);
   await Club.deleteOne({ _id: club._id });

   return successResponse(res, 200, "Club deleted", { slug: req.params.slug });
}

// POST /api/clubs/:slug/join — open=instant approved, request=pending, invite-only=forbidden.
async function joinClub(req, res) {
   const userId = req.user._id;

   // Only students join clubs. Coordinators are assigned at club creation or by a
   // superAdmin; superAdmins manage rather than join.
   if (req.user.role !== ROLES.STUDENT) {
      throw new ForbiddenError("Only students can join clubs");
   }

   const club = await findClubBySlugFor(req.user, req.params.slug);

   const policy = club.settings?.joinPolicy || "request";
   if (policy === "invite-only") {
      throw new ForbiddenError("This club is invite-only");
   }

   const existing = await ClubMembership.findOne({ userId, clubId: club._id });
   if (
      existing &&
      (existing.status === "approved" || existing.status === "pending")
   ) {
      throw new ConflictError(
         existing.status === "approved"
            ? "You are already a member"
            : "Your request is pending",
      );
   }
   // An admin-removed member can't re-join on their own — they must be re-invited.
   if (existing && existing.status === "removed") {
      throw new ForbiddenError(
         "You were removed from this club; an admin must re-invite you",
      );
   }

   const nextStatus = policy === "open" ? "approved" : "pending";
   const memberRoleId = await systemRoleId(club._id, "member");
   const update = {
      userId,
      clubId: club._id,
      roleId: memberRoleId,
      status: nextStatus,
      // Clear any stale terminal-state fields from a prior membership on re-join.
      leftAt: null,
      removedBy: null,
      joinedAt: nextStatus === "approved" ? new Date() : null,
   };

   // returnDocument: "before" lets us see the prior status, so a concurrent
   // double-join only counts the write that actually flipped them to approved.
   const prev = await ClubMembership.findOneAndUpdate(
      { userId, clubId: club._id },
      update,
      { upsert: true, setDefaultsOnInsert: true, returnDocument: "before" },
   );

   // Only increment for instant approvals, and only if this write did the transition.
   if (nextStatus === "approved" && prev?.status !== "approved") {
      await bumpClubStat(club._id, "memberCount", 1);
   }

   return successResponse(res, 200, "Join processed", { status: nextStatus });
}

// DELETE /api/clubs/:slug/membership — leave the club (or cancel a pending request).
// Coordinators can't leave on their own — a superAdmin must step them down first.
async function leaveClub(req, res) {
   const userId = req.user._id;
   const club = await findClubBySlugFor(req.user, req.params.slug);
   const coordinatorRoleId = await systemRoleId(club._id, "coordinator");

   // A coordinator can't walk away from a club they run — only a superAdmin can remove them or step them down.
   const current = await ClubMembership.findOne({ userId, clubId: club._id })
      .select("roleId status")
      .lean();
   if (
      current?.status === "approved" &&
      String(current.roleId) === String(coordinatorRoleId)
   ) {
      throw new ForbiddenError(
         "Coordinators can't leave a club — a super admin must step you down first",
      );
   }

   // Atomically flip an active membership to "left" for members.
   const prev = await ClubMembership.findOneAndUpdate(
      {
         userId,
         clubId: club._id,
         status: { $in: ["approved", "pending"] },
         roleId: { $ne: coordinatorRoleId },
      },
      // Voluntary leave — clear any stale admin-action audit pointer.
      { status: "left", leftAt: new Date(), removedBy: null },
      { returnDocument: "before" },
   );
   if (!prev) throw new NotFoundError("No active membership");

   const wasApproved = prev.status === "approved";
   const wasPending = prev.status === "pending";

   if (wasApproved) {
      await bumpClubStat(club._id, "memberCount", -1);
      // Members-only events are a membership benefit — the same rule evictOutsiders
      // applies when an event turns private. Public events keep their seat.
      await releaseSeats(userId, { clubId: club._id, visibility: "private" });
   }

   // "left" is the shared terminal state, but the message reflects what actually ended.
   const message = wasPending ? "Request cancelled" : "Left club";
   return successResponse(res, 200, message, { status: "left" });
}

// GET /api/clubs/:slug — public detail with current user's membership state inlined.
// `?view=summary` answers the question the club-admin pages actually ask ("which club am
// I on?"): a name, a tagline and the headline counts. It skips the membership, role and
// follow lookups entirely, since nothing in that shape reads them.
async function getClub(req, res) {
   const club = await findClubBySlugFor(req.user, req.params.slug);
   const userId = req.user?._id;

   if (req.validatedQuery?.view === "summary") {
      return successResponse(res, 200, "Club", {
         id: club._id,
         slug: club.slug,
         name: club.name,
         tagline: club.tagline,
         category: club.category,
         verified: !!club.verified,
         status: club.status,
         foundedYear: club.foundedYear,
         memberCount: club.stats?.memberCount ?? 0,
         eventCount: club.stats?.eventCount ?? 0,
      });
   }

   let membership = null;
   let isFollowing = false;
   if (userId) {
      [membership, isFollowing] = await Promise.all([
         ClubMembership.findOne({ userId, clubId: club._id })
            .select("status roleId joinedAt")
            .populate({ path: "roleId", select: "slug" })
            .lean(),
         ClubFollow.exists({ userId, clubId: club._id }).then(Boolean),
      ]);
   }

   // The announcements tab badge. Counted live rather than denormalised because the
   // number differs per viewer: members see the private notices, everyone else the
   // public ones. Members and events read their counts off club.stats, which can't
   // carry a per-viewer figure.
   const seesPrivate =
      membership?.status === "approved" || req.user?.role === ROLES.SUPER_ADMIN;
   const announcementCount = await Announcement.countDocuments({
      clubId: club._id,
      ...(seesPrivate ? {} : { visibility: "public" }),
   });

   return successResponse(res, 200, "Club", {
      id: club._id,
      slug: club.slug,
      name: club.name,
      category: club.category,
      tagline: club.tagline,
      description: club.description,
      coverFrom: club.coverFrom,
      coverTo: club.coverTo,
      verified: !!club.verified,
      status: club.status,
      foundedYear: club.foundedYear,
      tags: club.tags || [],
      socialLinks: club.socialLinks || {},
      memberCount: club.stats?.memberCount ?? 0,
      eventCount: club.stats?.eventCount ?? 0,
      followerCount: club.stats?.followerCount ?? 0,
      announcementCount,
      isFollowing,
      joinPolicy: club.settings?.joinPolicy || "request",
      isPrivate: !!club.settings?.isPrivate,
      membership: membership
         ? {
              status: membership.status,
              role: membership.roleId?.slug || null,
              joinedAt: membership.joinedAt,
           }
         : null,
   });
}

// POST /api/clubs/:slug/follow — subscribe to a club's public announcements.
// Following is deliberately lighter than membership: no approval, no policy, and it
// grants nothing beyond landing on the email list.
async function followClub(req, res) {
   if (req.user.role !== ROLES.STUDENT) {
      throw new ForbiddenError("Only students can follow clubs");
   }
   const club = await findClubBySlugFor(req.user, req.params.slug);

   // upsert + returnDocument:"before" so a double-tap can't double-count the club's
   // follower total — only the write that actually created the row increments it.
   const prev = await ClubFollow.findOneAndUpdate(
      { userId: req.user._id, clubId: club._id },
      { $setOnInsert: { userId: req.user._id, clubId: club._id } },
      { upsert: true, returnDocument: "before" },
   );
   if (!prev) {
      await bumpClubStat(club._id, "followerCount", 1);
   }

   const followerCount = await ClubFollow.countDocuments({ clubId: club._id });
   return successResponse(res, 200, "Following", {
      following: true,
      followerCount,
   });
}

// DELETE /api/clubs/:slug/follow — stop following.
async function unfollowClub(req, res) {
   const club = await findClubBySlugFor(req.user, req.params.slug);

   const removed = await ClubFollow.findOneAndDelete({
      userId: req.user._id,
      clubId: club._id,
   });
   if (removed) {
      await bumpClubStat(club._id, "followerCount", -1);
   }

   const followerCount = await ClubFollow.countDocuments({ clubId: club._id });
   return successResponse(res, 200, "Unfollowed", {
      following: false,
      followerCount,
   });
}

module.exports = {
   listClubs,
   getClub,
   followClub,
   unfollowClub,
   createClub,
   updateClub,
   setVerification,
   setStatus,
   deleteClub,
   joinClub,
   leaveClub,
};
