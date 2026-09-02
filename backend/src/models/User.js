// User accounts. One `users` collection, split by role via Mongoose discriminators
// (keyed on `role`) so each account type only carries the fields that apply to it:
//   - student     → academic profile, skills, interests, stats, full preferences
//   - faculty     → faculty profile (designation/office/expertise), slim preferences
//   - superAdmin  → base fields only
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

// ── Base: everything shared across all account types ──────────────────────────
const baseOptions = {
   timestamps: true,
   versionKey: false,
   discriminatorKey: "role", // the value of `role` selects the subtype
};

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

      emailVerified: { type: Boolean, default: false },
      isActive: { type: Boolean, default: true },
      lastLoginAt: Date,
      // Set by `DELETE /profile/me`; grace period before hard-delete.
      deletedAt: Date,

      metadata: mongoose.Schema.Types.Mixed,
   },
   baseOptions,
);

userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ createdAt: -1 });

const User = mongoose.model("User", userSchema);

// ── Student: the default self-signup account ──────────────────────────────────
const studentSchema = new mongoose.Schema({
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
   stats: {
      certificatesCount: { type: Number, default: 0 },
      contestRating: { type: Number, default: 0 },
      currentStreak: { type: Number, default: 0 },
      longestStreak: { type: Number, default: 0 },
      lastActivityAt: Date,
   },
   preferences: {
      notifications: {
         eventReminders: { type: Boolean, default: true },
         contestInvitations: { type: Boolean, default: true },
         // On by default: following a club is an explicit opt-in, and announcements
         // are how a club reaches its followers. The Settings toggle opts out.
         clubAnnouncements: { type: Boolean, default: true },
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
   },
});
studentSchema.index({ "skills.name": 1 });

// ── Faculty: runs clubs; no academic/contest fields ─────────────
const facultySchema = new mongoose.Schema({
   profile: {
      department: String,
      designation: String,
      officeLocation: String,
      bio: String,
      linkedinUrl: String,
      portfolioUrl: String,
      expertise: { type: [String], default: [] },
   },
   preferences: {
      notifications: {
         eventReminders: { type: Boolean, default: true },
         clubAnnouncements: { type: Boolean, default: true },
         emailDigest: { type: Boolean, default: true },
         channels: {
            email: { type: Boolean, default: true },
            push: { type: Boolean, default: true },
            inApp: { type: Boolean, default: true },
         },
      },
      privacy: {
         publicProfile: { type: Boolean, default: true },
      },
   },
});

// ── SuperAdmin: platform owner; base fields only ──────────────────────────────
const superAdminSchema = new mongoose.Schema({});

const Student = User.discriminator(ROLES.STUDENT, studentSchema);
const Faculty = User.discriminator(ROLES.FACULTY, facultySchema);
const SuperAdmin = User.discriminator(ROLES.SUPER_ADMIN, superAdminSchema);

module.exports = User;
module.exports.Student = Student;
module.exports.Faculty = Faculty;
module.exports.SuperAdmin = SuperAdmin;
module.exports.YEAR_OPTIONS = YEAR_OPTIONS;
