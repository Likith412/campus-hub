// Account-security routes. Unlike the other route files this one isn't mounted under a single
// prefix: its endpoints span /auth (the public password-reset flow) and /profile/me (authenticated
// account management), so it's mounted at the API root in routes/index.js and declares full paths.
const express = require("express");

const account = require("../controllers/accountSecurity");
const authenticate = require("../middlewares/authenticate");
const validate = require("../middlewares/validate");
const {
   forgotPasswordSchema,
   resetPasswordSchema,
} = require("../validators/auth");
const { changePasswordSchema } = require("../validators/profile");

const router = express.Router();

// ============================================================================
//  PASSWORD  (controllers/accountSecurity/password.controller)
// ============================================================================
// Authenticated password change — revokes all other sessions.
router.post(
   "/profile/me/change-password",
   authenticate,
   validate(changePasswordSchema),
   account.changePassword,
);

// ============================================================================
//  PASSWORD RESET  (controllers/accountSecurity/passwordReset.controller)
// ============================================================================
// Public — triggers the "forgot password" flow by sending a reset link to the email.
router.post(
   "/auth/forgot-password",
   validate(forgotPasswordSchema),
   account.forgotPassword,
);
// Public — checks token validity without consuming it (used by the reset page on mount).
router.get("/auth/reset-password/validate", account.validateResetToken);
// Public — consumes the password reset token from the link, sets new password.
router.post(
   "/auth/reset-password",
   validate(resetPasswordSchema),
   account.resetPassword,
);

// ============================================================================
//  SESSIONS  (controllers/accountSecurity/sessions.controller)
// ============================================================================
router.get("/profile/me/sessions", authenticate, account.getSessions);
router.delete("/profile/me/sessions/:id", authenticate, account.revokeSession);
router.post(
   "/profile/me/sessions/revoke-others",
   authenticate,
   account.revokeOtherSessions,
);

// ============================================================================
//  ACCOUNT  (controllers/accountSecurity/account.controller)
// ============================================================================
// Soft delete. Pending — need a background job to hard-delete after the retention window.
router.delete("/profile/me", authenticate, account.deleteAccount);

module.exports = router;
