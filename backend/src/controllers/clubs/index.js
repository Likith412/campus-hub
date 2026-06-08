// Clubs controllers barrel — preserves the `require("../controllers/clubs")` import surface.
// Handlers are split across clubs (browse/lifecycle), members, and roles.
module.exports = {
   ...require("./clubs.controller"),
   ...require("./members.controller"),
   ...require("./roles.controller"),
};
