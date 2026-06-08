// Per-club role: the unit faculty use to grant subsets of CLUB_PERMISSIONS to members.
// Two system rows seeded per club (coordinator weight 100, member weight 0); custom roles
// live at weights 1..99. `ClubMembership.roleId` is a foreign key to one of these per club.
const mongoose = require("mongoose");
const { CLUB_PERMISSION_KEYS } = require("../constants/clubPermissions");

const clubRoleSchema = new mongoose.Schema(
   {
      clubId: {
         type: mongoose.Schema.Types.ObjectId,
         ref: "Club",
         required: true,
      },
      name: { type: String, required: true, trim: true },
      // Stable per-club identifier (e.g. "coordinator"); unique within a club.
      slug: { type: String, required: true },
      // Badge colour for the members directory.
      color: { type: String, default: "#6c63ff" },
      permissions: [{ type: String, enum: CLUB_PERMISSION_KEYS }],
      // System rows (coordinator / member) can't be edited or deleted.
      isSystem: { type: Boolean, default: false },
      // Rank 0..100; doubles as the hierarchy gate for who can assign whom.
      roleWeight: { type: Number, default: 1, min: 0, max: 100 },
   },
   { timestamps: true, versionKey: false },
);

clubRoleSchema.index({ clubId: 1, slug: 1 }, { unique: true });
clubRoleSchema.index({ clubId: 1, roleWeight: -1 });

// The two system roles every club is born with. coordinator holds every permission.
function systemRoleDocs(clubId) {
   return [
      {
         clubId,
         name: "Coordinator",
         slug: "coordinator",
         color: "#6c63ff",
         permissions: CLUB_PERMISSION_KEYS,
         isSystem: true,
         roleWeight: 100,
      },
      {
         clubId,
         name: "Member",
         slug: "member",
         color: "#94a3b8",
         permissions: [],
         isSystem: true,
         roleWeight: 0,
      },
   ];
}

module.exports = mongoose.model("ClubRole", clubRoleSchema);
module.exports.systemRoleDocs = systemRoleDocs;
