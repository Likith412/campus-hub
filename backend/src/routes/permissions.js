// Permissions routes mounted at /api/permissions.
const express = require("express");

const clubs = require("../controllers/clubs");
const authenticate = require("../middlewares/authenticate");

const router = express.Router();
router.use(authenticate);

// GET /api/permissions/catalog — static list of grantable per-club permissions for the picker.
router.get("/catalog", clubs.getPermissionCatalog);

module.exports = router;
