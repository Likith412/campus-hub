const mongoose = require("mongoose");
const { ROLES } = require("../constants/roles");

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
      avatarUrl: String,

      role: {
         type: String,
         enum: Object.values(ROLES),
         default: ROLES.STUDENT,
      },

      profile: {
         department: String,
         year: { type: Number, min: 1, max: 4 },
         bio: String,
         linkedinUrl: String,
         githubUrl: String,
      },

      skills: { type: [String], default: [] },
      interests: { type: [String], default: [] },

      emailVerified: { type: Boolean, default: false },
      isActive: { type: Boolean, default: true },
      lastLoginAt: Date,

      preferences: {
         notifications: {
            email: { type: Boolean, default: true },
            push: { type: Boolean, default: true },
            inApp: { type: Boolean, default: true },
         },
         theme: { type: String, default: "light" },
         language: { type: String, default: "en" },
      },
      metadata: mongoose.Schema.Types.Mixed,
   },
   { timestamps: true, versionKey: false },
);

userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ skills: 1 });
userSchema.index({ createdAt: -1 });

module.exports = mongoose.model("User", userSchema);
