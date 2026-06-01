// Body validation using a Zod schema. Replaces req.body with the parsed (typed/coerced) data.
const { ValidationError } = require("../utils/errors");

function validate(schema) {
   return (req, res, next) => {
      const result = schema.safeParse(req.body);
      if (!result.success) {
         // flatten() returns a client-friendly { fieldErrors, formErrors } shape.
         return next(
            new ValidationError("Invalid request body", result.error.flatten()),
         );
      }
      req.body = result.data; // Use the parsed/sanitized data downstream.
      next();
   };
}

// Same idea but for req.query — used by list endpoints with filter/page params.
function validateQuery(schema) {
   return (req, res, next) => {
      const result = schema.safeParse(req.query);
      if (!result.success) {
         return next(
            new ValidationError("Invalid query params", result.error.flatten()),
         );
      }
      // req.query is a getter in Express 5 — attach parsed data to a new field instead.
      req.validatedQuery = result.data;
      next();
   };
}

module.exports = validate;
module.exports.validateQuery = validateQuery;
