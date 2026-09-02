// Admin controllers barrel — preserves the `require("../controllers/admin")` import surface.
module.exports = {
   ...require("./users.controller"),
   ...require("./clubs.controller"),
   ...require("./events.controller"),
};
