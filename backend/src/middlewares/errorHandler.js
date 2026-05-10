// Central error handler. Mounted last in app.js — converts any thrown error into a uniform JSON shape.
const { AppError } = require("../utils/errors");

function errorHandler(err, req, res, next) {
   // Known/expected errors expose their status+message. Everything else is a generic 500.
   const isOperational = err instanceof AppError;

   const status = isOperational ? err.status : 500;
   const code = isOperational ? err.code : "INTERNAL_ERROR";
   const message = isOperational ? err.message : "Internal server error";

   // Only log unexpected errors — operational errors are normal client mistakes.
   if (!isOperational) {
      console.error("Unexpected error:", err);
   }

   res.status(status).json({
      success: false,
      error: { code, message, details: err.details },
   });
}

module.exports = errorHandler;
