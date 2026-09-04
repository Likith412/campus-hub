// Field rules shared by more than one validator module.
const { z } = require("zod");

// Accept a valid URL or an empty string (→ undefined). Used for optional link fields.
const urlOrEmpty = z
   .union([z.string().url(), z.literal("")])
   .optional()
   .transform((v) => (v === "" ? undefined : v));

// Same rule for PATCH bodies, but "" survives so the handler can clear the field.
const urlOrEmptyKeep = z
   .union([z.string().url(), z.literal("")])
   .optional();

// The page / limit / search rules every list endpoint restates. `limitRule` takes the
// per-endpoint default; the ceiling of 50 is uniform.
const pageRule = z.coerce.number().int().min(1).default(1);
const limitRule = (def) =>
   def === undefined
      ? z.coerce.number().int().min(1).max(50).optional()
      : z.coerce.number().int().min(1).max(50).default(def);
const searchRule = z.string().trim().max(100).optional();

module.exports = {
   urlOrEmpty,
   urlOrEmptyKeep,
   pageRule,
   limitRule,
   searchRule,
};
