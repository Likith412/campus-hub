// Events controllers barrel — mirrors controllers/clubs. Handlers are split across
// events (lifecycle) and registrations (seats, waitlist, rosters).
module.exports = {
   ...require("./events.controller"),
   ...require("./registrations.controller"),
};
