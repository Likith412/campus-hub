// Auth controllers barrel — preserves the `require("../controllers/auth")` import surface.
module.exports = {
   ...require("./auth.controller"),
   ...require("./verification.controller"),
};
