// Zod schemas for /api/clubs endpoints.
const { z } = require("zod");
const { CLUB_CATEGORIES } = require("../models/Club");
const {
   MEMBERSHIP_ROLES,
   MEMBERSHIP_STATUSES,
} = require("../models/ClubMembership");

const SORTS = ["popular", "new", "active", "name"];
const JOIN_POLICIES = ["open", "request", "invite-only"];
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

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
      role: z.enum(MEMBERSHIP_ROLES).optional(),
      status: z.enum(MEMBERSHIP_STATUSES).default("approved"),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(50).default(20),
   })
   .strict();

// PATCH .../members/:userId/status — accept or reject a join request.
const memberStatusBodySchema = z
   .object({ status: z.enum(["approved", "rejected"]) })
   .strict();

// PATCH .../members/:userId/role — change an approved member's role.
const memberRoleBodySchema = z
   .object({ role: z.enum(MEMBERSHIP_ROLES) })
   .strict();

module.exports = {
   listClubsQuerySchema,
   listMembersQuerySchema,
   memberStatusBodySchema,
   memberRoleBodySchema,
   createClubBodySchema,
   verificationBodySchema,
   statusBodySchema,
   SORTS,
};
