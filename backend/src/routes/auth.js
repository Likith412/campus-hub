// Auth routes mounted at /api/auth. Middleware order per route: validate body → handler.
// The password-reset flow lives in routes/accountSecurity.js (its handlers are in the
// accountSecurity controller), even though those endpoints are also under /auth.
const express = require("express");

const authController = require("../controllers/auth");
const authenticate = require("../middlewares/authenticate");
const validate = require("../middlewares/validate");
const {
   registerSchema,
   loginSchema,
   resendVerificationSchema,
} = require("../validators/auth");

const router = express.Router();

// ============================================================================
//  AUTH  (controllers/auth/auth.controller)
// ============================================================================
// Public — creates a new account; verification email sent.
router.post("/register", validate(registerSchema), authController.register);
// Public — issues access JWT + refresh cookie.
router.post("/login", validate(loginSchema), authController.login);
// Public — uses the refresh cookie to mint a new access token (token rotation).
router.post("/refresh", authController.refresh);
// Authenticated — revokes session and blacklists the current access token.
router.post("/logout", authenticate, authController.logout);
// Authenticated — returns the currently logged-in user.
router.get("/me", authenticate, authController.me);

// ============================================================================
//  EMAIL VERIFICATION  (controllers/auth/verification.controller)
// ============================================================================
// Public — consumes the email verification token from the link.
router.get("/verify-email", authController.verifyEmail);
// Public — resend verification email if the original expired or got lost.
router.post(
   "/resend-verification",
   validate(resendVerificationSchema),
   authController.resendVerification,
);

module.exports = router;
