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

module.exports = { urlOrEmpty, urlOrEmptyKeep };
