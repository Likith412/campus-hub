// Profile controllers barrel — preserves the `require("../controllers/profile")` import surface.
module.exports = {
   ...require("./profile.controller"),
   ...require("./skills.controller"),
   ...require("./clubs.controller"),
   ...require("./publicProfile.controller"),
};
