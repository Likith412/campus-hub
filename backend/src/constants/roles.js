const { PERMISSIONS: P } = require("./permissions");

const ROLES = {
   STUDENT: "student",
   CLUB_ADMIN: "clubAdmin",
   SUPER_ADMIN: "superAdmin",
};

const DEFAULT_ROLES = [
   {
      name: ROLES.STUDENT,
      description: "Default role for all registered users.",
      permissions: [
         P.PROFILE_MANAGE,
         P.CLUB_READ,
         P.EVENT_READ,
         P.EVENT_REGISTER,
      ],
      isSystem: true,
   },
   {
      name: ROLES.CLUB_ADMIN,
      description: "Manages a club, its members, events, and announcements.",
      permissions: [
         P.PROFILE_MANAGE,
         P.CLUB_READ,
         P.CLUB_CREATE,
         P.CLUB_UPDATE,
         P.CLUB_MANAGE_MEMBERS,
         P.EVENT_READ,
         P.EVENT_CREATE,
         P.EVENT_UPDATE,
         P.EVENT_DELETE,
         P.EVENT_REGISTER,
         P.ANNOUNCEMENT_CREATE,
      ],
      isSystem: true,
   },
   {
      name: ROLES.SUPER_ADMIN,
      description: "Platform administrator with unrestricted access.",
      permissions: [P.ALL],
      isSystem: true,
   },
];

module.exports = { ROLES, DEFAULT_ROLES };
