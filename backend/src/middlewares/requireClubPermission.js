// Per-club permission gate.
//  - superAdmin short-circuits to full access (platform owner).
//  - the `coordinator` system role implicitly holds every club permission.
//  - any other role grants only the permissions stored on its ClubRole.
const { Club, ClubMembership, ClubRole } = require("../models");
const { ROLES } = require("../constants/roles");
const { NotFoundError, ForbiddenError } = require("../utils/errors");

function requireClubPermission(resource, action) {
   const needle = `${resource}:${action}`;
   return async (req, res, next) => {
      // 1. Resolve the target club from the route's :slug.
      const club = await Club.findOne({ slug: req.params.slug });
      // Inactive clubs are invisible to everyone but superAdmin.
      if (
         !club ||
         (club.status !== "active" && req.user.role !== ROLES.SUPER_ADMIN)
      ) {
         throw new NotFoundError("Club not found");
      }

      // 2. Resolve the caller's standing in the club.
      let ctx;
      if (req.user.role === ROLES.SUPER_ADMIN) {
         ctx = {
            isSuperAdmin: true,
            roleSlug: "coordinator",
            weight: Infinity,
            role: null,
            membership: null,
         };
      } else {
         const membership = await ClubMembership.findOne({
            userId: req.user._id,
            clubId: club._id,
            status: "approved",
         }).lean();
         if (!membership) {
            throw new ForbiddenError(
               "You don't have permission to do that in this club",
            );
         }
         const role = await ClubRole.findById(membership.roleId).lean();
         ctx = {
            isSuperAdmin: false,
            roleSlug: role?.slug ?? null,
            weight: role?.roleWeight ?? 0,
            role,
            membership,
         };
      }

      // 3. Enforce the permission. coordinator (and superAdmin) hold everything.
      const allowed =
         ctx.isSuperAdmin ||
         ctx.roleSlug === "coordinator" ||
         (ctx.role?.permissions || []).includes(needle);
      if (!allowed) {
         throw new ForbiddenError(
            "You don't have permission to do that in this club",
         );
      }

      req.clubContext = ctx;
      req.club = club;
      next();
   };
}

module.exports = requireClubPermission;
