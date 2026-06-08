// Zod schemas for /api/clubs endpoints.
const { z } = require("zod");
const { CLUB_CATEGORIES } = require("../models/Club");
const { MEMBERSHIP_STATUSES } = require("../models/ClubMembership");
const { CLUB_PERMISSION_KEYS } = require("../constants/clubPermissions");

const SORTS = ["popular", "new", "active", "name"];
const JOIN_POLICIES = ["open", "request", "invite-only"];
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
// A ClubRole.slug: lowercase letters, digits, hyphens (custom roles are free-form now).
const roleSlug = z
   .string()
   .trim()
   .toLowerCase()
   .min(1)
   .max(60)
   .regex(/^[a-z0-9-]+$/, "Invalid role");

// Accept a valid URL or an empty string (→ undefined). Used for optional link fields.
const urlOrEmpty = z
   .union([z.string().url(), z.literal("")])
   .optional()
   .transform((v) => (v === "" ? undefined : v));

// POST /api/clubs — create a club. slug is optional (derived from name when omitted).
const createClubBodySchema = z
   .object({
      name: z.string().trim().min(3).max(80),
      slug: z
         .string()
         .trim()
         .toLowerCase()
         .min(3)
         .max(60)
         .regex(/^[a-z0-9-]+$/, "Lowercase letters, digits and hyphens only")
         .optional(),
      category: z.enum(CLUB_CATEGORIES),
      tagline: z.string().trim().max(90).optional(),
      description: z.string().trim().max(500).optional(),
      tags: z.array(z.string().trim().max(40)).max(10).optional(),
      joinPolicy: z.enum(JOIN_POLICIES).default("request"),
      isPrivate: z.boolean().optional(),
      socialLinks: z
         .object({
            website: urlOrEmpty,
            instagram: urlOrEmpty,
            linkedin: urlOrEmpty,
         })
         .optional(),
      coverFrom: z.string().regex(HEX_COLOR).optional(),
      coverTo: z.string().regex(HEX_COLOR).optional(),
      foundedYear: z.coerce
         .number()
         .int()
         .min(1900)
         .max(new Date().getFullYear())
         .optional(),
      // superAdmin only: user ids of the faculty to assign as coordinators (≥1).
      coordinatorIds: z
         .array(z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid user id"))
         .max(20)
         .optional(),
   })
   .strict();

const verificationBodySchema = z
   .object({ verified: z.boolean() })
   .strict();

const statusBodySchema = z
   .object({ status: z.enum(["active", "suspended", "archived"]) })
   .strict();

const listClubsQuerySchema = z
   .object({
      q: z.string().trim().max(100).optional(),
      category: z.enum(CLUB_CATEGORIES).optional(),
      sort: z.enum(SORTS).default("popular"),
      verified: z.enum(["true", "false"]).optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(50).default(12),
   })
   .strict();

const listMembersQuerySchema = z
   .object({
      q: z.string().trim().max(100).optional(),
      role: roleSlug.optional(),
      // "past" is a convenience bucket (left + removed) used by the manage-members audit tab.
      status: z.enum([...MEMBERSHIP_STATUSES, "past"]).default("approved"),
      sort: z.enum(["role", "new", "active"]).default("role"),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(50).default(20),
   })
   .strict();

// PATCH .../members/:userId/status — accept or reject a join request.
const memberStatusBodySchema = z
   .object({ status: z.enum(["approved", "rejected"]) })
   .strict();

// PATCH .../members/:userId/role — assign a ClubRole slug (system or custom).
const memberRoleBodySchema = z.object({ role: roleSlug }).strict();

// POST /api/clubs/:slug/roles — create a custom role (weight 1..99).
const createRoleBodySchema = z
   .object({
      name: z.string().trim().min(2).max(40),
      roleWeight: z.coerce.number().int().min(1).max(99),
      permissions: z.array(z.enum(CLUB_PERMISSION_KEYS)).max(20).optional(),
      color: z.string().regex(HEX_COLOR).optional(),
   })
   .strict();

// PATCH /api/clubs/:slug/roles/:roleSlug — edit a custom role (every field optional).
const updateRoleBodySchema = z
   .object({
      name: z.string().trim().min(2).max(40),
      roleWeight: z.coerce.number().int().min(1).max(99),
      permissions: z.array(z.enum(CLUB_PERMISSION_KEYS)).max(20),
      color: z.string().regex(HEX_COLOR),
   })
   .partial()
   .strict()
   .refine((b) => Object.keys(b).length > 0, {
      message: "Provide at least one field to update",
   });

// PATCH /api/clubs/:slug — edit a club. Every field optional; at least one required.
const updateClubBodySchema = z
   .object({
      name: z.string().trim().min(3).max(80),
      tagline: z.string().trim().max(90),
      description: z.string().trim().max(500),
      category: z.enum(CLUB_CATEGORIES),
      logoUrl: urlOrEmpty,
      bannerUrl: urlOrEmpty,
      tags: z.array(z.string().trim().max(40)).max(10),
      settings: z
         .object({
            joinPolicy: z.enum(JOIN_POLICIES).optional(),
            isPrivate: z.boolean().optional(),
         })
         .strict(),
      socialLinks: z.object({
         website: urlOrEmpty,
         instagram: urlOrEmpty,
         linkedin: urlOrEmpty,
      }),
      coverFrom: z.string().regex(HEX_COLOR),
      coverTo: z.string().regex(HEX_COLOR),
      foundedYear: z.coerce
         .number()
         .int()
         .min(1900)
         .max(new Date().getFullYear()),
   })
   .partial()
   .strict()
   .refine((b) => Object.keys(b).length > 0, {
      message: "Provide at least one field to update",
   });

// POST /api/clubs/:slug/coordinators — assign another faculty as a per-club coordinator.
const addCoordinatorBodySchema = z
   .object({
      userId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid user id"),
   })
   .strict();

module.exports = {
   listClubsQuerySchema,
   listMembersQuerySchema,
   memberStatusBodySchema,
   memberRoleBodySchema,
   createClubBodySchema,
   updateClubBodySchema,
   addCoordinatorBodySchema,
   verificationBodySchema,
   statusBodySchema,
   createRoleBodySchema,
   updateRoleBodySchema,
};
