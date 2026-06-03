// Zod schemas for /api/admin/* endpoints (superAdmin-only platform administration).
const { z } = require("zod");

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
      role: z.enum(["student", "coordinator", "superAdmin"]).optional(),
      q: z.string().trim().max(100).optional(),
      status: z.enum(["active", "inactive", "pending"]).optional(),
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

module.exports = {
   createFacultyBodySchema,
   listUsersQuerySchema,
   setUserActiveBodySchema,
};
