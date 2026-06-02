// Join table linking a User to a Club, with their per-club role and engagement score.
const mongoose = require("mongoose");

// Role within a single club. Two system roles today; custom roles (1c.5) will widen this.
// When 1c.5 lands, the enum constraint is dropped — role becomes any slug from the per-club ClubRole collection.
const MEMBERSHIP_ROLES = ["clubAdmin", "member"];
// Lifecycle of a join request.
const MEMBERSHIP_STATUSES = [
   "pending",
   "approved",
   "rejected",
   "left",
   "removed",
];

// Mirrors the role's rank (1–100). Doubles as the sort weight for the members listing.
// Custom roles from 1c.5 will land in 1..99; clubAdmin stays at 100, member at 0.
const ROLE_WEIGHT = { clubAdmin: 100, member: 0 };

const clubMembershipSchema = new mongoose.Schema(
   {
      userId: {
         type: mongoose.Schema.Types.ObjectId,
         ref: "User",
         required: true,
      },
      clubId: {
         type: mongoose.Schema.Types.ObjectId,
         ref: "Club",
         required: true,
      },

      role: {
         type: String,
         enum: MEMBERSHIP_ROLES,
         default: "member",
      },
      // Mirror of role for fast sort: clubAdmin=100, member=0. Kept in sync via pre-save hook.
      roleWeight: { type: Number, default: 0 },
      status: {
         type: String,
         enum: MEMBERSHIP_STATUSES,
         default: "pending",
      },

      engagementScore: { type: Number, default: 0 },

      joinedAt: Date,
      leftAt: Date,
      // Audit: who took the terminal action. Null when the user left voluntarily;
      // set to the acting admin's userId when status was set to "removed".
      removedBy: {
         type: mongoose.Schema.Types.ObjectId,
         ref: "User",
         default: null,
      },
   },
   { timestamps: true, versionKey: false },
);

// One membership per (user, club). Other indexes power "my clubs" and per-club leaderboards.
clubMembershipSchema.index({ userId: 1, clubId: 1 }, { unique: true });
clubMembershipSchema.index({ userId: 1, status: 1 });
clubMembershipSchema.index({ clubId: 1, role: 1 });
clubMembershipSchema.index({ clubId: 1, engagementScore: -1 });
// Powers the members listing sort (status filter + role-weight, engagement, join time).
clubMembershipSchema.index({
   clubId: 1,
   status: 1,
   roleWeight: -1,
   engagementScore: -1,
   joinedAt: 1,
});

module.exports = mongoose.model("ClubMembership", clubMembershipSchema);
module.exports.MEMBERSHIP_ROLES = MEMBERSHIP_ROLES;
module.exports.MEMBERSHIP_STATUSES = MEMBERSHIP_STATUSES;
module.exports.ROLE_WEIGHT = ROLE_WEIGHT;
