// Role gate. Usage: router.get("/admin", authenticate, requireRole("superAdmin"), handler).
// Must run after `authenticate` so req.user is populated.
const { ForbiddenError } = require("../utils/errors");

function requireRole(...allowedRoles) {
   return (req, res, next) => {
      if (!req.user) return next(new ForbiddenError()); // Defensive: should never hit if `authenticate` ran first.
      if (!allowedRoles.includes(req.user.role)) {
         return next(new ForbiddenError("Insufficient role"));
      }
      next();
   };
}

module.exports = requireRole;
