// Profile controller — header + account form (the Profile & Settings page core).
const { successResponse } = require("../../utils/response");
const { NotFoundError, ConflictError } = require("../../utils/errors");
const { User } = require("../../models");
const { ROLES } = require("../../constants/roles");
const { modelFor } = require("./helpers");

// Shape the caller's own user record for /profile/me. Sensitive fields (passwordHash,
// deletedAt) are left off.
function publicProfile(u) {
   return {
      id: u._id,
      email: u.email,
      name: u.name,
      username: u.username,
      phone: u.phone,
      role: u.role,
      profile: u.profile,
      interests: u.interests,
      emailVerified: u.emailVerified,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
   };
}

// Computes profile completion percentage for the progress bar.
function computeCompletion(u) {
   // Faculty have a faculty-shaped profile — score the fields that apply to them.
   const checks =
      u.role === ROLES.FACULTY
         ? [
              !!u.name,
              !!u.profile?.bio,
              !!u.profile?.department,
              !!u.profile?.designation,
              !!u.profile?.officeLocation,
              !!u.profile?.linkedinUrl,
              (u.profile?.expertise || []).length > 0,
           ]
         : [
              !!u.name,
              !!u.username,
              !!u.profile?.bio,
              !!u.profile?.department,
              !!u.profile?.year,
              !!u.profile?.linkedinUrl,
              !!u.profile?.githubUrl,
              !!u.profile?.portfolioUrl,
              (u.skills || []).length > 0,
              (u.interests || []).length > 0,
           ];
   const done = checks.filter(Boolean).length;
   return Math.round((done / checks.length) * 100);
}

// GET /profile/me — header data only. Cheap, called on every Profile page mount.
async function getMe(req, res) {
   const user = await User.findById(req.user._id).lean();
   if (!user) throw new NotFoundError("User not found");
   return successResponse(res, 200, "Profile", {
      user: publicProfile(user),
      completion: computeCompletion(user),
   });
}

// PATCH /profile/me — account form. Sparse update: only fields present in the body are touched.
async function updateMe(req, res) {
   const updates = req.body;

   if (updates.username) {
      const taken = await User.exists({
         username: updates.username,
         _id: { $ne: req.user._id },
      });
      if (taken) throw new ConflictError("Username already taken");
   }

   // Mongo $set with dotted keys so we don't blow away sibling fields inside `profile`.
   const $set = {};
   for (const [k, v] of Object.entries(updates)) {
      if (k === "profile" && v && typeof v === "object") {
         for (const [pk, pv] of Object.entries(v)) $set[`profile.${pk}`] = pv;
      } else {
         $set[k] = v;
      }
   }

   const user = await modelFor(req.user).findByIdAndUpdate(
      req.user._id,
      { $set },
      { returnDocument: "after", runValidators: true },
   ).lean();

   return successResponse(res, 200, "Profile updated", {
      user: publicProfile(user),
      completion: computeCompletion(user),
   });
}

module.exports = {
   getMe,
   updateMe,
};
