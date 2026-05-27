// Registration writes only email/passwordHash/name/role; rest filled via profile endpoints.
const mongoose = require("mongoose");
const { ROLES } = require("../constants/roles");

const YEAR_OPTIONS = ["1", "2", "3", "4", "postgrad"];

const skillSchema = new mongoose.Schema(
   {
      name: { type: String, required: true, trim: true },
      level: { type: Number, min: 0, max: 100, default: 0 },
      category: String,
   },
   { _id: false },
);

const userSchema = new mongoose.Schema(
   {
      email: {
         type: String,
         required: true,
         unique: true,
         lowercase: true,
         trim: true,
      },
      passwordHash: { type: String, required: true },
      name: { type: String, required: true, trim: true },

      // Sparse-unique so unset handles don't collide.
      username: {
         type: String,
         lowercase: true,
         trim: true,
         sparse: true,
         unique: true,
      },
      phone: { type: String, trim: true },
      avatarUrl: String,
      coverUrl: String,

      role: {
         type: String,
         enum: Object.values(ROLES),
         default: ROLES.STUDENT,
      },

      profile: {
         department: String,
         year: { type: String, enum: YEAR_OPTIONS },
         bio: String,
         linkedinUrl: String,
         githubUrl: String,
         portfolioUrl: String,
         tags: { type: [String], default: [] },
      },

      skills: { type: [skillSchema], default: [] },
      interests: { type: [String], default: [] },

      emailVerified: { type: Boolean, default: false },
      isActive: { type: Boolean, default: true },
      lastLoginAt: Date,
      // Set by `DELETE /profile/me`; grace period before hard-delete.
      deletedAt: Date,

      preferences: {
         notifications: {
            eventReminders: { type: Boolean, default: true },
            contestInvitations: { type: Boolean, default: true },
            clubAnnouncements: { type: Boolean, default: false },
            emailDigest: { type: Boolean, default: true },
            channels: {
               email: { type: Boolean, default: true },
               push: { type: Boolean, default: true },
               inApp: { type: Boolean, default: true },
            },
         },
         privacy: {
            publicProfile: { type: Boolean, default: true },
            showOnLeaderboards: { type: Boolean, default: true },
         },
         theme: { type: String, default: "light" },
         language: { type: String, default: "en" },
      },

      // Denormalized rollups maintained by background jobs.
      stats: {
         eventsAttended: { type: Number, default: 0 },
         certificatesCount: { type: Number, default: 0 },
         contestRating: { type: Number, default: 0 },
         currentStreak: { type: Number, default: 0 },
         longestStreak: { type: Number, default: 0 },
         lastActivityAt: Date,
      },

      metadata: mongoose.Schema.Types.Mixed,
   },
   { timestamps: true, versionKey: false },
);

userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ "skills.name": 1 });
userSchema.index({ createdAt: -1 });
module.exports = mongoose.model("User", userSchema);
module.exports.YEAR_OPTIONS = YEAR_OPTIONS;
