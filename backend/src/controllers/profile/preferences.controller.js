// Profile preferences controller — every toggle on the Settings page.
const { successResponse } = require("../../utils/response");
const { User } = require("../../models");
const { modelFor } = require("./helpers");

// GET /profile/me/preferences — every toggle on the Settings page.
async function getPreferences(req, res) {
   const user = await User.findById(req.user._id, "preferences").lean();
   return successResponse(res, 200, "Preferences", {
      preferences: user?.preferences || {},
   });
}

// PATCH /profile/me/preferences — partial update of nested toggle groups (notifications, privacy).
async function updatePreferences(req, res) {
   const $set = {};
   const flatten = (prefix, obj) => {
      for (const [k, v] of Object.entries(obj)) {
         if (v && typeof v === "object" && !Array.isArray(v)) {
            flatten(`${prefix}.${k}`, v);
         } else {
            $set[`${prefix}.${k}`] = v;
         }
      }
   };
   flatten("preferences", req.body);

   const user = await modelFor(req.user).findByIdAndUpdate(
      req.user._id,
      { $set },
      { returnDocument: "after", runValidators: true },
   ).lean();
   return successResponse(res, 200, "Preferences updated", {
      preferences: user.preferences,
   });
}

module.exports = {
   getPreferences,
   updatePreferences,
};
