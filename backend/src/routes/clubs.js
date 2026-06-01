// Clubs routes mounted at /api/clubs.
const express = require("express");

const clubs = require("../controllers/clubs");
const authenticate = require("../middlewares/authenticate");
const { validateQuery } = require("../middlewares/validate");
const { listClubsQuerySchema } = require("../validators/clubs");

const router = express.Router();
router.use(authenticate);

router.get("/", validateQuery(listClubsQuerySchema), clubs.listClubs);
router.post("/:slug/join", clubs.joinClub);
router.delete("/:slug/membership", clubs.leaveClub);

module.exports = router;
