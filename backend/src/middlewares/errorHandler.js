// Central error handler. Mounted last in app.js — converts any thrown error into a uniform JSON shape.
const { AppError } = require("../utils/errors");

// A malformed ObjectId in a route param ("/events/abc") reaches Mongoose as a
// CastError. That's a client asking for something that can't exist, not a server
// fault — report it the same way a valid-but-missing id is reported.
function isBadObjectId(err) {
   return err?.name === "CastError" && err.kind === "ObjectId";
}

// A unique index rejecting a write is a conflict the client can act on, not a fault.
function isDuplicateKey(err) {
   return err?.code === 11000;
}

// body-parser (malformed JSON, payload too large) sets its own status before we see it.
function isBodyParserError(err) {
   return (
      typeof err?.status === "number" && err.status >= 400 && err.status < 500
   );
}

function errorHandler(err, req, res, next) {
   // Known/expected errors expose their status+message. Everything else is a generic 500.
   const isOperational = err instanceof AppError;
   const known =
      !isOperational &&
      (isBadObjectId(err)
         ? { status: 404, code: "NOT_FOUND", message: "Not found" }
         : isDuplicateKey(err)
           ? { status: 409, code: "CONFLICT", message: "Already exists" }
           : isBodyParserError(err)
             ? {
                  status: err.status,
                  code: "BAD_REQUEST",
                  message: "Malformed request",
               }
             : null);

   const status = isOperational ? err.status : (known?.status ?? 500);
   const code = isOperational ? err.code : (known?.code ?? "INTERNAL_ERROR");
   const message = isOperational
      ? err.message
      : (known?.message ?? "Internal server error");

   // Only log genuinely unexpected errors — operational errors and the client mistakes
   // above are normal traffic.
   if (!isOperational && !known) {
      console.error("Unexpected error:", err);
   }

   res.status(status).json({
      success: false,
      error: { code, message, details: err.details },
   });
}

module.exports = errorHandler;
