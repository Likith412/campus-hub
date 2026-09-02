// Zod schemas for /api/admin/* endpoints (superAdmin-only platform administration).
const { z } = require("zod");
const { CLUB_CATEGORIES } = require("../models/Club");
const { EVENT_TYPES, EVENT_STATUSES } = require("../models/Event");

// Create a faculty (coordinator) account. Password is generated server-side.
const createFacultyBodySchema = z
   .object({
      name: z.string().trim().min(2).max(80),
      email: z.string().trim().toLowerCase().email().max(120),
   })
   .strict();

// List platform users — filterable by role + lifecycle status, searchable by name/email.
// status: active = logged in at least once; pending = created but never logged in; inactive = deactivated.
const listUsersQuerySchema = z
   .object({
      role: z.enum(["student", "faculty", "superAdmin"]).optional(),
      q: z.string().trim().max(100).optional(),
      status: z.enum(["active", "inactive", "pending"]).optional(),
      sort: z.enum(["new", "name", "clubs"]).default("new"),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(50).default(20),
   })
   .strict();

// Toggle a user's isActive flag.
const setUserActiveBodySchema = z
   .object({
      isActive: z.boolean(),
   })
   .strict();

// GET /api/admin/clubs — every club across the institute, filterable by domain + status.
// GET /api/admin/events — institute-wide event listing.
const listAllEventsQuerySchema = z
   .object({
      q: z.string().trim().max(100).optional(),
      club: z
         .string()
         .trim()
         .toLowerCase()
         .max(60)
         .regex(/^[a-z0-9-]+$/, "Invalid club")
         .optional(),
      type: z.enum(EVENT_TYPES).optional(),
      status: z.enum(EVENT_STATUSES).optional(),
      when: z.enum(["upcoming", "past", "all"]).default("all"),
      sort: z.enum(["soonest", "latest", "new", "popular"]).default("soonest"),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(50).default(20),
   })
   .strict();

const listAllClubsQuerySchema = z
   .object({
      q: z.string().trim().max(100).optional(),
      category: z.enum(CLUB_CATEGORIES).optional(),
      status: z.enum(["active", "suspended", "archived"]).optional(),
      sort: z.enum(["popular", "new", "name"]).default("popular"),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(50).default(20),
   })
   .strict();

module.exports = {
   createFacultyBodySchema,
   listUsersQuerySchema,
   setUserActiveBodySchema,
   listAllClubsQuerySchema,
   listAllEventsQuerySchema,
};
