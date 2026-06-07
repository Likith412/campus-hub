// Shared helpers for the clubs controllers (browse/lifecycle, members, roles).
const { Club, ClubMembership, ClubRole } = require("../../models");
const { systemRoleDocs } = require("../../models/ClubRole");
const { ROLES } = require("../../constants/roles");
const { NotFoundError, ForbiddenError } = require("../../utils/errors");

// Make sure a club has its two system roles (coordinator/member). Cheap idempotent upsert —
// covers clubs created before Phase 6 the first time anyone reads or edits their roles.
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

// Escape user input before dropping into a RegExp.
function escapeRegex(s) {
   return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

// Turn a name into a url-safe slug.
function slugify(s) {
   return s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
}

// === Per-club authorization ===
// Used by the controllers for inline gates and for building the "what can this viewer do" parts
// of responses. (The requireClubPermission route middleware enforces the same rules inline.)
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

   const role = await ClubRole.findOne({ clubId, slug: membership.role }).lean();
   return {
      isSuperAdmin: false,
      roleSlug: membership.role,
      // Prefer the live ClubRole weight; fall back to the denormalized membership weight.
      weight: role?.roleWeight ?? membership.roleWeight ?? 0,
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

// Throw 403 unless the caller holds `perm` in the club. Returns the resolved context on success.
async function assertPermission(user, clubId, perm) {
   const ctx = await resolveClubContext(user, clubId);
   if (!contextCan(ctx, perm)) {
      throw new ForbiddenError("You don't have permission to do that in this club");
   }
   return ctx;
}

module.exports = {
   ensureSystemRoles,
   escapeRegex,
   findClubBySlugFor,
   slugify,
   resolveClubContext,
   contextCan,
   assertPermission,
};
