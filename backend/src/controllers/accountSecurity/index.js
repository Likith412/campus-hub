// Account-security controllers barrel — preserves the
// `require("../controllers/accountSecurity")` import surface.
module.exports = {
   ...require("./password.controller"),
   ...require("./passwordReset.controller"),
   ...require("./sessions.controller"),
   ...require("./account.controller"),
};
