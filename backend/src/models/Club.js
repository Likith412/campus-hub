const mongoose = require("mongoose");

const CLUB_CATEGORIES = [
   "tech",
   "cultural",
   "sports",
   "literary",
   "social",
   "other",
];

const CLUB_STATUSES = ["pending", "active", "suspended", "archived"];

const clubSchema = new mongoose.Schema(
   {
      name: { type: String, required: true, trim: true },
      slug: {
         type: String,
         required: true,
         unique: true,
         lowercase: true,
         trim: true,
      },
      category: {
         type: String,
         enum: CLUB_CATEGORIES,
         required: true,
      },
      description: String,
      logoUrl: String,
      bannerUrl: String,

      createdBy: {
         type: mongoose.Schema.Types.ObjectId,
         ref: "User",
         required: true,
      },

      status: {
         type: String,
         enum: CLUB_STATUSES,
         default: "pending",
      },

      settings: {
         isPrivate: { type: Boolean, default: false },
         joinPolicy: {
            type: String,
            enum: ["open", "request", "invite-only"],
            default: "request",
         },
         allowGuests: { type: Boolean, default: false },
      },

      stats: {
         memberCount: { type: Number, default: 0 },
         eventCount: { type: Number, default: 0 },
         totalEngagement: { type: Number, default: 0 },
      },

      socialLinks: {
         website: String,
         instagram: String,
         linkedin: String,
      },
      tags: { type: [String], default: [] },
   },
   { timestamps: true, versionKey: false },
);

clubSchema.index({ category: 1, status: 1 });
clubSchema.index({ status: 1, createdAt: -1 });
clubSchema.index({ tags: 1 });

module.exports = mongoose.model("Club", clubSchema);
module.exports.CLUB_CATEGORIES = CLUB_CATEGORIES;
module.exports.CLUB_STATUSES = CLUB_STATUSES;
