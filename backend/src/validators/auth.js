const { z } = require("zod");

const passwordRule = z
   .string()
   .min(8, "Password must be at least 8 characters")
   .max(128, "Password too long")
   .regex(/[A-Z]/, "Password must contain an uppercase letter")
   .regex(/[a-z]/, "Password must contain a lowercase letter")
   .regex(/[0-9]/, "Password must contain a number");

const registerSchema = z.object({
   email: z.string().email().toLowerCase().trim(),
   password: passwordRule,
   name: z.string().min(2).max(80).trim(),
});

const loginSchema = z.object({
   email: z.string().email().toLowerCase().trim(),
   password: z.string().min(1),
});

module.exports = {
   registerSchema,
   loginSchema,
};
