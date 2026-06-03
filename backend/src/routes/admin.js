// Admin routes mounted at /api/admin. All superAdmin-only.
const express = require("express");

const admin = require("../controllers/admin");
const authenticate = require("../middlewares/authenticate");
const requireRole = require("../middlewares/requireRole");
const validate = require("../middlewares/validate");
const { validateQuery } = require("../middlewares/validate");
const { ROLES } = require("../constants/roles");
const {
   createFacultyBodySchema,
   listUsersQuerySchema,
   setUserActiveBodySchema,
} = require("../validators/admin");

const router = express.Router();
router.use(authenticate, requireRole(ROLES.SUPER_ADMIN));

router.get("/users", validateQuery(listUsersQuerySchema), admin.listUsers);
router.get("/faculty/stats", admin.getFacultyStats);
router.post("/users", validate(createFacultyBodySchema), admin.createFaculty);
router.patch(
   "/users/:id/active",
   validate(setUserActiveBodySchema),
   admin.setUserActive,
);

module.exports = router;
