// Auth routes mounted at /api/auth. Middleware order per route: rate limit → validate body → handler.
const express = require("express");

const authController = require("../controllers/auth");
const passwordReset = require("../controllers/passwordReset");
const authenticate = require("../middlewares/authenticate");
const validate = require("../middlewares/validate");
const {
   loginLimiter,
   registerLimiter,
   passwordLimiter,
   verificationLimiter,
} = require("../middlewares/rateLimit");
const {
   registerSchema,
   loginSchema,
   forgotPasswordSchema,
   resetPasswordSchema,
   resendVerificationSchema,
} = require("../validators/auth");

const router = express.Router();

// Public — creates a new account; verification email sent.
router.post(
   "/register",
   // registerLimiter,
   validate(registerSchema),
   authController.register,
);
// Public — issues access JWT + refresh cookie.
router.post(
   "/login",
   // loginLimiter,
   validate(loginSchema),
   authController.login,
);
// Public — uses the refresh cookie to mint a new access token (token rotation).
router.post("/refresh", authController.refresh);
// Authenticated — revokes session and blacklists the current access token.
router.post("/logout", authenticate, authController.logout);
// Authenticated — returns the currently logged-in user.
router.get("/me", authenticate, authController.me);

// Public — consumes the email verification token from the link.
router.get("/verify-email", authController.verifyEmail);
// Public — resend verification email if the original expired or got lost.
router.post(
   "/resend-verification",
   // verificationLimiter,
   validate(resendVerificationSchema),
   authController.resendVerification,
);
// Public — triggers the "forgot password" flow by sending a reset link to the email.
router.post(
   "/forgot-password",
   passwordLimiter,
   validate(forgotPasswordSchema),
   passwordReset.forgotPassword,
);
// Public — checks token validity without consuming it (used by the reset page on mount).
router.get("/reset-password/validate", passwordReset.validateResetToken);
// Public — consumes the password reset token from the link, sets new password.
router.post(
   "/reset-password",
   // passwordLimiter,
   validate(resetPasswordSchema),
   passwordReset.resetPassword,
);

module.exports = router;
