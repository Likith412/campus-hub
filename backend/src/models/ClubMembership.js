// Join table linking a User to a Club, with their per-club role and engagement score.
const mongoose = require("mongoose");

// Role within a single club (separate from the global app role on User).
const MEMBERSHIP_ROLES = ["admin", "volunteer", "member"];
// Lifecycle of a join request.
const MEMBERSHIP_STATUSES = ["pending", "approved", "rejected", "left"];

// Stored sort weight so list queries can sort admins → volunteers → members in a plain index scan.
const ROLE_WEIGHT = { admin: 2, volunteer: 1, member: 0 };

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
      // Mirror of role for fast sort: admin=2, volunteer=1, member=0. Kept in sync via pre-save hook.
      roleWeight: { type: Number, default: 0 },
      status: {
         type: String,
         enum: MEMBERSHIP_STATUSES,
         default: "pending",
      },

      engagementScore: { type: Number, default: 0 },

      joinedAt: Date,
      leftAt: Date,
   },
   { timestamps: true, versionKey: false },
);

// Keep roleWeight in lockstep with role on document saves.
clubMembershipSchema.pre("save", function (next) {
   if (this.isModified("role") || this.isNew) {
      this.roleWeight = ROLE_WEIGHT[this.role] ?? 0;
   }
   next();
});

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
