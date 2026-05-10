const { AppError } = require("../utils/errors");

function errorHandler(err, req, res, next) {
   const isOperational = err instanceof AppError;

   const status = isOperational ? err.status : 500;
   const code = isOperational ? err.code : "INTERNAL_ERROR";
   const message = isOperational ? err.message : "Internal server error";

   if (!isOperational) {
      console.error("Unexpected error:", err);
   }

   res.status(status).json({
      success: false,
      error: { code, message, details: err.details },
   });
}

module.exports = errorHandler;
