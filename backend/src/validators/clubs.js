// Zod schemas for /api/clubs endpoints.
const { z } = require("zod");
const { CLUB_CATEGORIES } = require("../models/Club");
const {
   MEMBERSHIP_ROLES,
   MEMBERSHIP_STATUSES,
} = require("../models/ClubMembership");

const SORTS = ["popular", "new", "active", "name"];

const listClubsQuerySchema = z
   .object({
      q: z.string().trim().max(100).optional(),
      category: z.enum(CLUB_CATEGORIES).optional(),
      sort: z.enum(SORTS).default("popular"),
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

// PATCH body — at least one of role/status must be provided.
const updateMemberBodySchema = z
   .object({
      role: z.enum(MEMBERSHIP_ROLES).optional(),
      status: z.enum(["approved", "rejected"]).optional(),
   })
   .strict()
   .refine((b) => b.role || b.status, {
      message: "Provide role or status",
   });

module.exports = {
   listClubsQuerySchema,
   listMembersQuerySchema,
   updateMemberBodySchema,
   SORTS,
};
