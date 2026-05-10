// Canonical permission strings used by roles. Format: "resource:action".
// Stored on Role documents and checked by authorization middleware.
const PERMISSIONS = {
   PROFILE_MANAGE: "profile:manage",

   CLUB_READ: "club:read",
   CLUB_CREATE: "club:create",
   CLUB_UPDATE: "club:update",
   CLUB_DELETE: "club:delete",
   CLUB_MANAGE_MEMBERS: "club:manage_members",

   EVENT_READ: "event:read",
   EVENT_CREATE: "event:create",
   EVENT_UPDATE: "event:update",
   EVENT_DELETE: "event:delete",
   EVENT_REGISTER: "event:register",

   ANNOUNCEMENT_CREATE: "announcement:create",

   USER_MANAGE: "user:manage",
   ROLE_MANAGE: "role:manage",

   ALL: "*", // Wildcard granted to super admins.
};

module.exports = { PERMISSIONS };
