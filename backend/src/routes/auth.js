const express = require("express");

const authController = require("../controllers/auth");
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

router.post(
   "/register",
   registerLimiter,
   validate(registerSchema),
   authController.register,
);
router.post(
   "/login",
   loginLimiter,
   validate(loginSchema),
   authController.login,
);
router.post("/refresh", authController.refresh);
router.post("/logout", authenticate, authController.logout);
router.get("/me", authenticate, authController.me);

router.get("/verify-email", authController.verifyEmail);
router.post(
   "/resend-verification",
   verificationLimiter,
   validate(resendVerificationSchema),
   authController.resendVerification,
);

router.post(
   "/forgot-password",
   passwordLimiter,
   validate(forgotPasswordSchema),
   authController.forgotPassword,
);
router.post(
   "/reset-password",
   passwordLimiter,
   validate(resetPasswordSchema),
   authController.resetPassword,
);

module.exports = router;
