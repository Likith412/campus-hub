// Club model: a student-run organization. Members live in ClubMembership; events live in Event.
const mongoose = require("mongoose");

const CLUB_CATEGORIES = [
   "tech",
   "design",
   "culture",
   "sports",
   "business",
   "media",
   "social",
   "other",
];

// Clubs go live immediately on creation; verification (the ✓ badge) is a separate trust signal.
const CLUB_STATUSES = ["active", "suspended", "archived"];

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
      // One-line hook shown on the club card; `description` is the longer about text.
      tagline: String,
      description: String,
      logoUrl: String,
      bannerUrl: String,

      // Optional brand colors for the card cover gradient — falls back to category palette.
      coverFrom: String,
      coverTo: String,

      // SuperAdmin-verified badge shown on the listing card.
      verified: { type: Boolean, default: false },
      foundedYear: Number,

      createdBy: {
         type: mongoose.Schema.Types.ObjectId,
         ref: "User",
         required: true,
      },

      status: {
         type: String,
         enum: CLUB_STATUSES,
         default: "active",
      },

      settings: {
         isPrivate: { type: Boolean, default: false },
         joinPolicy: {
            type: String,
            enum: ["open", "request", "invite-only"],
            default: "request",
         },
      },

      // Denormalized counters for fast listing pages — kept in sync by service-layer writes.
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

// Indexes tuned for the common list/filter queries on the clubs page.
clubSchema.index({ category: 1, status: 1 });
clubSchema.index({ status: 1, createdAt: -1 });
clubSchema.index({ tags: 1 });

module.exports = mongoose.model("Club", clubSchema);
module.exports.CLUB_CATEGORIES = CLUB_CATEGORIES;
module.exports.CLUB_STATUSES = CLUB_STATUSES;
