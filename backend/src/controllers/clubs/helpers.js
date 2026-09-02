// Shared helpers for the clubs controllers (browse/lifecycle, members, roles).
const { Club, ClubMembership, ClubRole } = require("../../models");
const { systemRoleDocs } = require("../../models/ClubRole");
const { ROLES } = require("../../constants/roles");
const { NotFoundError } = require("../../utils/errors");

// Make sure a club has its two system roles (coordinator/member). Cheap idempotent upsert —
// covers clubs created before the roles system landed, on first read or edit.
async function ensureSystemRoles(clubId) {
   await ClubRole.bulkWrite(
      systemRoleDocs(clubId).map((doc) => ({
         updateOne: {
            filter: { clubId, slug: doc.slug },
            update: { $setOnInsert: doc },
            upsert: true,
         },
      })),
   );
}

// Find a club by slug. Non-active (suspended/archived) clubs are visible & manageable only to superAdmin.
async function findClubBySlugFor(user, slug) {
   const club = await Club.findOne({ slug });
   if (!club) throw new NotFoundError("Club not found");
   if (club.status !== "active" && user?.role !== ROLES.SUPER_ADMIN) {
      throw new NotFoundError("Club not found");
   }
   return club;
}

// Sort options shared by the student browse list and the admin table.
const CLUB_SORT = {
   popular: { "stats.memberCount": -1, createdAt: -1 },
   new: { createdAt: -1 },
   active: { "stats.eventCount": -1, "stats.memberCount": -1 },
   name: { name: 1 },
};

// Move a denormalized club counter. Decrements are floored at zero so a double-decrement
// can never drive a count negative.
async function bumpClubStat(clubId, field, delta) {
   const filter =
      delta < 0 ? { _id: clubId, [`stats.${field}`]: { $gt: 0 } } : { _id: clubId };
   await Club.updateOne(filter, { $inc: { [`stats.${field}`]: delta } });
}

// Turn a name into a url-safe slug.
function slugify(s) {
   return s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
}

// Resolve a club's ClubRole _id by slug, ensuring the system roles exist first. Membership
// writes/filters that key off the "coordinator"/"member" system roles use this now that
// ClubMembership references ClubRole by id.
async function systemRoleId(clubId, slug) {
   let role = await ClubRole.findOne({ clubId, slug }).select("_id").lean();
   if (!role) {
      await ensureSystemRoles(clubId);
      role = await ClubRole.findOne({ clubId, slug }).select("_id").lean();
   }
   return role?._id ?? null;
}

// === Per-club authorization ===
// The single source of these rules: the controllers use them for inline gates and viewer
// flags, and middlewares/requireClubPermission imports them for its route gate.
//
//  - superAdmin short-circuits to full access (platform owner).
//  - the `coordinator` system role implicitly holds every club permission.
//  - any other role grants only the permissions stored on its ClubRole.

// Resolve the caller's standing in a club: their approved membership, its ClubRole, and weight.
// Returns null when the user has no approved membership (and isn't superAdmin).
async function resolveClubContext(user, clubId) {
   if (user.role === ROLES.SUPER_ADMIN) {
      return { isSuperAdmin: true, roleSlug: "coordinator", weight: Infinity, role: null, membership: null };
   }
   const membership = await ClubMembership.findOne({
      userId: user._id,
      clubId,
      status: "approved",
   }).lean();
   if (!membership) return null;

   const role = await ClubRole.findById(membership.roleId).lean();
   return {
      isSuperAdmin: false,
      roleSlug: role?.slug ?? null,
      weight: role?.roleWeight ?? 0,
      role,
      membership,
   };
}

// Does this context grant `perm`? coordinator (and superAdmin) hold everything.
function contextCan(ctx, perm) {
   if (!ctx) return false;
   if (ctx.isSuperAdmin || ctx.roleSlug === "coordinator") return true;
   return (ctx.role?.permissions || []).includes(perm);
}

module.exports = {
   CLUB_SORT,
   bumpClubStat,
   ensureSystemRoles,
   findClubBySlugFor,
   slugify,
   systemRoleId,
   resolveClubContext,
   contextCan,
};
