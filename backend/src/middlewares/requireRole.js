const { ForbiddenError } = require("../utils/errors");

function requireRole(...allowedRoles) {
   return (req, res, next) => {
      if (!req.user) return next(new ForbiddenError());
      if (!allowedRoles.includes(req.user.role)) {
         return next(new ForbiddenError("Insufficient role"));
      }
      next();
   };
}

module.exports = requireRole;
