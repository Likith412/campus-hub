// Per-club permission gate. Resolves the club from :slug and the caller's standing in it,
// then enforces the permission. The rules themselves live in controllers/clubs/helpers so
// the middleware and the controllers' inline gates can't drift apart.
const { Club } = require("../models");
const { ROLES } = require("../constants/roles");
const { NotFoundError, ForbiddenError } = require("../utils/errors");
const {
   resolveClubContext,
   contextCan,
} = require("../controllers/clubs/helpers");

const DENIED = "You don't have permission to do that in this club";

// Resolve :slug and the caller's context onto the request. Inactive clubs are invisible
// to everyone but superAdmin.
async function loadClubContext(req) {
   // Lean + projected: no handler behind this gate mutates req.club. The field list is
   // the union of what they read directly (_id, slug) and what they hand to helpers —
   // assertCanBePublic reads verified, evictOutsiders and notifyAnnouncement read name,
   // eventClub reads name/slug, and the visibility check below reads status.
   const club = await Club.findOne({ slug: req.params.slug })
      .select("_id slug name verified status")
      .lean();
   if (!club || (club.status !== "active" && req.user.role !== ROLES.SUPER_ADMIN)) {
      throw new NotFoundError("Club not found");
   }
   const ctx = await resolveClubContext(req.user, club._id);
   if (!ctx) throw new ForbiddenError(DENIED);

   req.clubContext = ctx;
   req.club = club;
   return ctx;
}

function requireClubPermission(resource, action) {
   const needle = `${resource}:${action}`;
   return async (req, res, next) => {
      const ctx = await loadClubContext(req);
      if (!contextCan(ctx, needle)) throw new ForbiddenError(DENIED);
      next();
   };
}

// Same gate, but any one of the listed permissions is enough. Used where a route serves
// two operations with different permissions and the handler picks between them.
function requireAnyClubPermission(...pairs) {
   const needles = pairs.map(([resource, action]) => `${resource}:${action}`);
   return async (req, res, next) => {
      const ctx = await loadClubContext(req);
      if (!needles.some((n) => contextCan(ctx, n))) {
         throw new ForbiddenError(DENIED);
      }
      next();
   };
}

module.exports = requireClubPermission;
module.exports.requireAnyClubPermission = requireAnyClubPermission;
