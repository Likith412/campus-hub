// Zod schemas for the auth endpoints. Used via the `validate` middleware on each route.
const { z } = require("zod");

// Strong-password policy. Used for both registration and reset (not login — login takes any non-empty string).
const passwordRule = z
   .string()
   .min(8, "Password must be at least 8 characters")
   .max(128, "Password too long")
   .regex(/[A-Z]/, "Password must contain an uppercase letter")
   .regex(/[a-z]/, "Password must contain a lowercase letter")
   .regex(/[0-9]/, "Password must contain a number");

// Normalize emails to lowercase + trim so lookups always match.
const emailRule = z.string().email().toLowerCase().trim();

const registerSchema = z.object({
   email: emailRule,
   password: passwordRule,
   name: z.string().min(2).max(80).trim(),
});

const loginSchema = z.object({
   email: emailRule,
   password: z.string().min(1),
});

const forgotPasswordSchema = z.object({
   email: emailRule,
});

const resetPasswordSchema = z.object({
   token: z.string().min(32),
   password: passwordRule,
});

const resendVerificationSchema = z.object({
   email: emailRule,
});

module.exports = {
   registerSchema,
   loginSchema,
   forgotPasswordSchema,
   resetPasswordSchema,
   resendVerificationSchema,
};
