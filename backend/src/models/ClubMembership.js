const mongoose = require("mongoose");

const MEMBERSHIP_ROLES = ["admin", "volunteer", "member"];
const MEMBERSHIP_STATUSES = ["pending", "approved", "rejected", "left"];

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

clubMembershipSchema.index({ userId: 1, clubId: 1 }, { unique: true });
clubMembershipSchema.index({ userId: 1, status: 1 });
clubMembershipSchema.index({ clubId: 1, role: 1 });
clubMembershipSchema.index({ clubId: 1, engagementScore: -1 });

module.exports = mongoose.model("ClubMembership", clubMembershipSchema);
module.exports.MEMBERSHIP_ROLES = MEMBERSHIP_ROLES;
module.exports.MEMBERSHIP_STATUSES = MEMBERSHIP_STATUSES;
