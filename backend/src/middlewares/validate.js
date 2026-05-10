const { ValidationError } = require("../utils/errors");

function validate(schema) {
   return (req, res, next) => {
      const result = schema.safeParse(req.body);
      if (!result.success) {
         return next(
            new ValidationError("Invalid request body", result.error.flatten()),
         );
      }
      req.body = result.data;
      next();
   };
}

module.exports = validate;
