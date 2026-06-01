// Zod schemas for /api/clubs endpoints.
const { z } = require("zod");
const { CLUB_CATEGORIES } = require("../models/Club");

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

module.exports = { listClubsQuerySchema, SORTS };
