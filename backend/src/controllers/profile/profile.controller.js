// Profile controller — header + account form (the Profile & Settings page core).
const { successResponse } = require("../../utils/response");
const { ConflictError } = require("../../utils/errors");
const {
   User,
   Club,
   ClubMembership,
   Event,
   EventRegistration,
} = require("../../models");
const { ROLES } = require("../../constants/roles");
const { modelFor } = require("./helpers");
const { LIVE_REGISTRATION_STATUSES } = require("../events/helpers");

// Shape the caller's own user record for /profile/me. Sensitive fields (passwordHash,
// deletedAt) are left off.
function publicProfile(u) {
   return {
      id: u._id,
      email: u.email,
      name: u.name,
      username: u.username,
      phone: u.phone,
      role: u.role,
      profile: u.profile,
      interests: u.interests,
      emailVerified: u.emailVerified,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
   };
}

// GET /profile/me — header data only. `authenticate` already loaded this exact
// document, so there is nothing left to fetch.
async function getMe(req, res) {
   return successResponse(res, 200, "Profile", {
      user: publicProfile(req.user),
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
   });
}

// GET /profile/me/stats — the three headline counts on the dashboard.
// Same numbers the public profile computes, but counted in the database instead of
// populating every registration and filtering in memory: the dashboard needs the
// totals, not the rows behind them.
async function getMyStats(req, res) {
   const userId = req.user._id;
   const isStudent = req.user.role === ROLES.STUDENT;

   const memberships = await ClubMembership.find({ userId, status: "approved" })
      .select("clubId roleId")
      .populate({ path: "roleId", select: "slug" })
      .lean();

   // A membership in a suspended or archived club doesn't count, same as the profile.
   const activeClubs = await Club.find({
      _id: { $in: memberships.map((m) => m.clubId) },
      status: "active",
   })
      .select("_id")
      .lean();
   const activeIds = new Set(activeClubs.map((c) => String(c._id)));

   const now = new Date();
   let eventsRegistered = 0;
   let upcomingEvents = 0;

   if (isStudent) {
      // Students count what they hold a seat or a queue place for.
      const live = await EventRegistration.find({
         userId,
         status: { $in: LIVE_REGISTRATION_STATUSES },
      })
         .select("eventId")
         .lean();
      // The same predicate listMyEvents uses, so the dashboard greeting can't disagree
      // with the list right below it: published, not yet ended, active host club.
      const upcomingFilter = {
         _id: { $in: live.map((r) => r.eventId) },
         status: "published",
         // endAt, not startAt: an event running right now is still "coming up".
         endAt: { $gte: now },
      };
      const activeHostIds = live.length
         ? await Club.find({
              _id: { $in: await Event.find(upcomingFilter).distinct("clubId") },
              status: "active",
           }).distinct("_id")
         : [];
      [eventsRegistered, upcomingEvents] = await Promise.all([
         EventRegistration.countDocuments({ userId, status: "registered" }),
         activeHostIds.length
            ? Event.countDocuments({
                 ...upcomingFilter,
                 clubId: { $in: activeHostIds },
              })
            : 0,
      ]);
   } else {
      // Staff count what the clubs they coordinate are putting on.
      const coordinated = memberships
         .filter(
            (m) =>
               m.roleId?.slug === "coordinator" && activeIds.has(String(m.clubId)),
         )
         .map((m) => m.clubId);
      upcomingEvents = coordinated.length
         ? await Event.countDocuments({
              clubId: { $in: coordinated },
              status: "published",
              // endAt, matching the student branch — one running now hasn't happened yet.
              endAt: { $gte: now },
           })
         : 0;
   }

   return successResponse(res, 200, "Stats", {
      clubs: activeIds.size,
      eventsRegistered,
      upcomingEvents,
   });
}

module.exports = {
   getMe,
   updateMe,
   getMyStats,
};
