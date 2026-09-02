// Role identifiers stored on the User document. Platform-level gating is by role name
// (see middlewares/requireRole); per-club permissions live in constants/clubPermissions.
const ROLES = {
   STUDENT: "student",
   FACULTY: "faculty",
   SUPER_ADMIN: "superAdmin",
};

module.exports = { ROLES };
