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

module.exports = validate;
