// Zod schemas for the profile endpoints. Each schema is intentionally narrow — the profile page
// updates one slice at a time (lazy save) so we don't accept a giant payload that mixes concerns.
const { z } = require("zod");
const { YEAR_OPTIONS } = require("../models/User");
const { passwordRule } = require("./auth");

const urlOrEmpty = z
   .union([z.string().url(), z.literal("")])
   .optional()
   .transform((v) => (v === "" ? undefined : v));

const updateProfileSchema = z
   .object({
      name: z.string().min(2).max(80).trim().optional(),
      username: z
         .string()
         .min(3)
         .max(30)
         .regex(/^[a-z0-9._-]+$/, "Lowercase letters, digits, . _ - only")
         .optional(),
      phone: z.string().min(6).max(20).optional(),
      avatarUrl: urlOrEmpty,
      coverUrl: urlOrEmpty,
      profile: z
         .object({
            department: z.string().max(120).optional(),
            year: z.enum(YEAR_OPTIONS).optional(),
            bio: z.string().max(280).optional(),
            linkedinUrl: urlOrEmpty,
            githubUrl: urlOrEmpty,
            portfolioUrl: urlOrEmpty,
            tags: z.array(z.string().max(40)).max(10).optional(),
         })
         .optional(),
      interests: z.array(z.string().max(40)).max(30).optional(),
   })
   .strict();

const updateSkillsSchema = z.object({
   skills: z
      .array(
         z.object({
            name: z.string().min(1).max(60),
            level: z.number().int().min(0).max(100).default(0),
            category: z.string().max(40).optional(),
         }),
      )
      .max(50),
});

// Settings tabs send partial patches — only the toggles the user flipped come over the wire.
const updatePreferencesSchema = z
   .object({
      notifications: z
         .object({
            eventReminders: z.boolean().optional(),
            contestInvitations: z.boolean().optional(),
            clubAnnouncements: z.boolean().optional(),
            emailDigest: z.boolean().optional(),
            channels: z
               .object({
                  email: z.boolean().optional(),
                  push: z.boolean().optional(),
                  inApp: z.boolean().optional(),
               })
               .optional(),
         })
         .optional(),
      privacy: z
         .object({
            publicProfile: z.boolean().optional(),
            showOnLeaderboards: z.boolean().optional(),
         })
         .optional(),
      theme: z.enum(["light", "dark", "system"]).optional(),
      language: z.string().min(2).max(8).optional(),
   })
   .strict();

const changePasswordSchema = z.object({
   currentPassword: z.string().min(1),
   newPassword: passwordRule,
});

module.exports = {
   updateProfileSchema,
   updateSkillsSchema,
   updatePreferencesSchema,
   changePasswordSchema,
};
