// Join table linking a User to a Club, with their per-club role and engagement score.
const mongoose = require("mongoose");

// Lifecycle of a join request.
const MEMBERSHIP_STATUSES = [
   "pending",
   "approved",
   "rejected",
   "left",
   "removed",
];

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

      // The member's role in this club — a foreign key to a per-club ClubRole.
      // Rank/permissions live on the ClubRole (no denormalized weight here).
      roleId: {
         type: mongoose.Schema.Types.ObjectId,
         ref: "ClubRole",
         required: true,
      },
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
clubMembershipSchema.index({ clubId: 1, roleId: 1 });
clubMembershipSchema.index({ clubId: 1, engagementScore: -1 });
// Powers the members listing (status filter, then engagement / join time). Sorting by role
// rank is done via a $lookup to ClubRole.roleWeight, so it can't be indexed here.
clubMembershipSchema.index({
   clubId: 1,
   status: 1,
   engagementScore: -1,
   joinedAt: 1,
});

module.exports = mongoose.model("ClubMembership", clubMembershipSchema);
module.exports.MEMBERSHIP_STATUSES = MEMBERSHIP_STATUSES;
