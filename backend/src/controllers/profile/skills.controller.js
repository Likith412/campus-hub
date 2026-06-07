// Profile skills controller — the Skills tab.
const { successResponse } = require("../../utils/response");
const { User } = require("../../models");
const { modelFor } = require("./helpers");

// GET /profile/me/skills
async function getSkills(req, res) {
   const user = await User.findById(req.user._id, "skills").lean();
   return successResponse(res, 200, "Skills", { skills: user?.skills || [] });
}

// PUT /profile/me/skills — replaces the full list. Frontend re-sends every row after edit.
async function updateSkills(req, res) {
   const user = await modelFor(req.user).findByIdAndUpdate(
      req.user._id,
      { $set: { skills: req.body.skills } },
      { returnDocument: "after", runValidators: true },
   ).lean();
   return successResponse(res, 200, "Skills updated", { skills: user.skills });
}

module.exports = {
   getSkills,
   updateSkills,
};
