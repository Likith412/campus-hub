// Public profile controller — GET /profile/:handle. Any signed-in user can open anyone
// else's profile; the viewer's identity decides how much of the account record comes back.
// The account block (login state, activation) is superAdmin-only.
const mongoose = require("mongoose");
const { successResponse, pageMeta } = require("../../utils/response");
const { NotFoundError } = require("../../utils/errors");
const {
   User,
   ClubMembership,
   Club,
   Event,
   EventRegistration,
} = require("../../models");
const { ROLES } = require("../../constants/roles");
const { LIVE_REGISTRATION_STATUSES } = require("../events/helpers");

// Share links carry a username when one is set and the raw id otherwise.
function handleFilter(handle) {
   return mongoose.isValidObjectId(handle)
      ? { _id: handle }
      : { username: String(handle).toLowerCase() };
}

// Everything on this object is safe for any signed-in viewer to see.
// `showEmail` mirrors the account block below: a real email address is contact info
// for the account's owner (or a superAdmin), not something a stranger who found this
// profile through a club roster or an event's attendee list should be handed.
function publicCard(u, { showEmail = false } = {}) {
   return {
      id: u._id,
      name: u.name,
      username: u.username || null,
      email: showEmail ? u.email : null,
      role: u.role,
      profile: u.profile || {},
      interests: u.interests || [],
      skills: u.skills || [],
      emailVerified: !!u.emailVerified,
      createdAt: u.createdAt,
   };
}

// Approved memberships in clubs that are still active, newest first.
async function clubsOf(userId) {
   const rows = await ClubMembership.find({ userId, status: "approved" })
      .populate({
         path: "clubId",
         model: Club,
         select: "name slug coverFrom coverTo verified status stats.memberCount",
      })
      .populate({ path: "roleId", select: "name slug" })
      .sort({ joinedAt: -1 })
      .lean();

   return rows
      .filter((m) => m.clubId && m.clubId.status === "active")
      .map((m) => ({
         clubId: m.clubId._id,
         name: m.clubId.name,
         slug: m.clubId.slug,
         coverFrom: m.clubId.coverFrom,
         coverTo: m.clubId.coverTo,
         verified: !!m.clubId.verified,
         memberCount: m.clubId.stats?.memberCount || 0,
         role: m.roleId?.slug || null,
         roleName: m.roleId?.name || null,
         joinedAt: m.joinedAt,
      }));
}

// One row in the profile's event list. Both the student and faculty lists use it.
function publicEventRow(e) {
   return {
      id: e._id,
      title: e.title,
      startAt: e.startAt,
      endAt: e.endAt,
      eventType: e.eventType,
      visibility: e.visibility || "private",
      venue: e.venue,
      club: e.clubId ? { name: e.clubId.name, slug: e.clubId.slug } : null,
      // The profile row shows seats the same way Club Home does.
      capacity: e.capacity || 0,
      registeredCount: e.stats?.registered || 0,
   };
}

const EVENTS_PAGE = 5;

// Upcoming events this person holds a live registration for. Students only — staff run
// events rather than register for them. A stranger only sees the public ones; a private
// event would otherwise leak the club's internal calendar.
async function upcomingEventsOf(userId, includePrivate, page = 1, limit = EVENTS_PAGE) {
   // Two steps rather than populate-then-filter-in-memory: the registration rows carry
   // no copy of the event's status or visibility, but their ids are enough for the
   // database to do the filtering, sorting and paging itself.
   const regs = await EventRegistration.find({
      userId,
      status: { $in: LIVE_REGISTRATION_STATUSES },
   })
      .select("eventId")
      .lean();
   if (regs.length === 0) return { items: [], total: 0 };

   const filter = {
      _id: { $in: regs.map((r) => r.eventId) },
      status: "published",
      startAt: { $gte: new Date() },
   };
   if (!includePrivate) filter.visibility = "public";

   // Same rule clubsOf applies to the club list: a suspended club's event 404s when
   // opened, so it isn't listed. Both queries are bounded by this person's own events.
   const clubIds = await Event.find(filter).distinct("clubId");
   const activeClubIds = await Club.find({
      _id: { $in: clubIds },
      status: "active",
   }).distinct("_id");
   if (activeClubIds.length === 0) return { items: [], total: 0 };
   filter.clubId = { $in: activeClubIds };

   const skip = (page - 1) * limit;
   const [rows, total] = await Promise.all([
      Event.find(filter)
         .select(
            "title startAt endAt eventType venue visibility clubId capacity stats.registered",
         )
         .populate({ path: "clubId", model: Club, select: "name slug" })
         .sort({ startAt: 1 })
         .skip(skip)
         .limit(limit)
         .lean(),
      Event.countDocuments(filter),
   ]);
   return { items: rows.map(publicEventRow), total };
}

// The faculty counterpart: what the clubs they coordinate are putting on next. Same
// visibility rule — a stranger sees only the public ones.
async function upcomingClubEventsOf(clubIds, includePrivate, page = 1, limit = EVENTS_PAGE) {
   if (clubIds.length === 0) return { items: [], total: 0 };
   const filter = {
      clubId: { $in: clubIds },
      status: "published",
      startAt: { $gte: new Date() },
   };
   if (!includePrivate) filter.visibility = "public";

   const skip = (page - 1) * limit;
   const [rows, total] = await Promise.all([
      Event.find(filter)
         .select(
            "title startAt endAt eventType venue visibility clubId capacity stats.registered",
         )
         .populate({ path: "clubId", model: Club, select: "name slug" })
         .sort({ startAt: 1 })
         .skip(skip)
         .limit(limit)
         .lean(),
      Event.countDocuments(filter),
   ]);
   return { items: rows.map(publicEventRow), total };
}

// Resolve the profile being viewed and the viewer's relationship to it. Shared so the
// profile and its paged events list can never drift apart on who may see what.
async function resolveTarget(req) {
   const target = await User.findOne({
      ...handleFilter(req.params.handle),
      deletedAt: null,
   }).lean();
   if (!target) throw new NotFoundError("Profile not found");

   const isSelf = String(target._id) === String(req.user._id);
   const isAdmin = req.user.role === ROLES.SUPER_ADMIN;

   // A superAdmin has no public presence — only they can open their own profile.
   // 404 rather than 403 so the endpoint doesn't confirm the account exists.
   if (target.role === ROLES.SUPER_ADMIN && !isSelf) {
      throw new NotFoundError("Profile not found");
   }
   return { target, isSelf, isAdmin };
}

// GET /profile/:handle/events?page= — page through the panel without refetching the
// whole profile. Same visibility rules as the profile itself.
async function listProfileEvents(req, res) {
   const { target, isSelf, isAdmin } = await resolveTarget(req);
   const { page, limit } = req.validatedQuery;

   const seesPrivate = isSelf || isAdmin;
   let result;
   if (target.role === ROLES.STUDENT) {
      result = await upcomingEventsOf(target._id, seesPrivate, page, limit);
   } else {
      const clubs = await clubsOf(target._id);
      const ids = clubs.filter((c) => c.role === "coordinator").map((c) => c.clubId);
      result = await upcomingClubEventsOf(ids, seesPrivate, page, limit);
   }

   return successResponse(res, 200, "Events", {
      items: result.items,
      pagination: pageMeta(page, limit, result.total, result.items.length),
   });
}

// GET /profile/:handle
async function getPublicProfile(req, res) {
   const { target, isSelf, isAdmin } = await resolveTarget(req);

   // SuperAdmins can act on anyone but another superAdmin (including themselves).
   const canManage = isAdmin && target.role !== ROLES.SUPER_ADMIN;

   const isStudent = target.role === ROLES.STUDENT;
   const seesPrivate = isSelf || isAdmin;

   const clubs = await clubsOf(target._id);
   const coordinated = clubs.filter((c) => c.role === "coordinator");
   const coordinatedIds = coordinated.map((c) => c.clubId);

   // Students show what they signed up for; staff show what their clubs are running.
   const [eventsRegistered, eventsHosted, events] = await Promise.all([
      isStudent
         ? EventRegistration.countDocuments({
              userId: target._id,
              status: "registered",
           })
         : 0,
      isStudent || coordinatedIds.length === 0
         ? 0
         : Event.countDocuments({
              clubId: { $in: coordinatedIds },
              status: "published",
           }),
      isStudent
         ? upcomingEventsOf(target._id, seesPrivate)
         : upcomingClubEventsOf(coordinatedIds, seesPrivate),
   ]);
   const eventsPagination = pageMeta(1, EVENTS_PAGE, events.total, events.items.length);

   return successResponse(res, 200, "Profile", {
      user: publicCard(target, { showEmail: isAdmin || isSelf }),
      isSelf,
      canManage,
      stats: {
         clubs: clubs.length,
         eventsRegistered,
         coordinating: coordinated.length,
         eventsHosted,
         // Everyone across the clubs they coordinate — the reach of their work.
         membersReached: coordinated.reduce((n, c) => n + c.memberCount, 0),
      },
      clubs,
      events: events.items,
      eventsPagination,
      // Account state is administrative — only a superAdmin (or the owner) sees it.
      account:
         isAdmin || isSelf
            ? {
                 isActive: target.isActive !== false,
                 lastLoginAt: target.lastLoginAt || null,
                 createdAt: target.createdAt,
                 emailVerified: !!target.emailVerified,
              }
            : null,
   });
}

module.exports = { getPublicProfile, listProfileEvents };
