// Zod schemas for the profile endpoints. Each schema is intentionally narrow — the profile page
// updates one slice at a time (lazy save) so we don't accept a giant payload that mixes concerns.
const { z } = require("zod");
const { YEAR_OPTIONS } = require("../models/User");
const { passwordRule } = require("./auth");
const { limitRule, pageRule, searchRule, urlOrEmptyKeep } = require("./common");

const updateProfileSchema = z
   .object({
      name: z.string().min(2).max(80).trim().optional(),
      username: z
         .string()
         .min(3)
         .max(30)
         .regex(/^[a-z0-9._-]+$/, "Lowercase letters, digits, . _ - only")
         .optional(),
      // "" clears the field; anything else has to be a real value.
      phone: z.union([z.string().min(6).max(20), z.literal("")]).optional(),
      profile: z
         .object({
            department: z.string().max(120).optional(),
            // "" clears it — mapped to null so the model's enum validator skips it.
            year: z
               .union([z.enum(YEAR_OPTIONS), z.literal("")])
               .optional()
               .transform((v) => (v === "" ? null : v)),
            bio: z.string().max(280).optional(),
            linkedinUrl: urlOrEmptyKeep,
            githubUrl: urlOrEmptyKeep,
            portfolioUrl: urlOrEmptyKeep,
            tags: z.array(z.string().max(40)).max(10).optional(),
            // Faculty/coordinator fields.
            designation: z.string().max(80).optional(),
            officeLocation: z.string().max(80).optional(),
            expertise: z.array(z.string().max(40)).max(12).optional(),
         })
         .optional(),
      interests: z.array(z.string().max(40)).max(30).optional(),
   })
   .strict();

const updateSkillsSchema = z
   .object({
      skills: z
         .array(
            z
               .object({
                  name: z.string().trim().min(1).max(60),
                  level: z.number().int().min(0).max(100).default(0),
                  category: z.string().max(40).optional(),
               })
               .strict(),
         )
         .max(50)
         // The profile keys its rows by name, so two "React" entries would collide.
         .refine(
            (rows) =>
               new Set(rows.map((r) => r.name.toLowerCase())).size === rows.length,
            { message: "Each skill can only be listed once" },
         ),
   })
   .strict();

// `limit` is opt-in: without it the whole list comes back, which is what the club
// switcher needs. My Clubs passes one and gets a page.
const listMyClubsQuerySchema = z
   .object({
      relation: z.enum(["member", "following", "all"]).default("member"),
      q: searchRule,
      category: z.string().trim().max(40).optional(),
      sort: z.enum(["recent", "name", "members"]).default("recent"),
      page: pageRule,
      limit: limitRule(),
   })
   .strict();

// GET /profile/:handle/events — the profile page's event panel pages on its own.
const listProfileEventsQuerySchema = z
   .object({
      page: pageRule,
      limit: limitRule(5),
   })
   .strict();

const changePasswordSchema = z.object({
   currentPassword: z.string().min(1),
   newPassword: passwordRule,
});

module.exports = {
   updateProfileSchema,
   listProfileEventsQuerySchema,
   listMyClubsQuerySchema,
   updateSkillsSchema,
   changePasswordSchema,
};
