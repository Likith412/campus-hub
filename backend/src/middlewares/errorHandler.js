// Central error handler. Mounted last in app.js — converts any thrown error into a uniform JSON shape.
const { AppError } = require("../utils/errors");

// A malformed ObjectId in a route param ("/events/abc") reaches Mongoose as a
// CastError. That's a client asking for something that can't exist, not a server
// fault — report it the same way a valid-but-missing id is reported.
function isBadObjectId(err) {
   return err?.name === "CastError" && err.kind === "ObjectId";
}

function errorHandler(err, req, res, next) {
   // Known/expected errors expose their status+message. Everything else is a generic 500.
   const isOperational = err instanceof AppError;
   const badId = !isOperational && isBadObjectId(err);

   const status = isOperational ? err.status : badId ? 404 : 500;
   const code = isOperational ? err.code : badId ? "NOT_FOUND" : "INTERNAL_ERROR";
   const message = isOperational
      ? err.message
      : badId
        ? "Not found"
        : "Internal server error";

   // Only log genuinely unexpected errors — operational errors and bad ids are
   // normal client mistakes.
   if (!isOperational && !badId) {
      console.error("Unexpected error:", err);
   }

   res.status(status).json({
      success: false,
      error: { code, message, details: err.details },
   });
}

module.exports = errorHandler;
