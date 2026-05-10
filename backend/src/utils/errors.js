class AppError extends Error {
   constructor(message, status = 500, code = "INTERNAL_ERROR") {
      super(message);
      this.status = status;
      this.code = code;
      this.isOperational = true;
   }
}

class ValidationError extends AppError {
   constructor(message = "Validation failed", details) {
      super(message, 400, "VALIDATION_ERROR");
      this.details = details;
   }
}

class UnauthorizedError extends AppError {
   constructor(message = "Unauthorized") {
      super(message, 401, "UNAUTHORIZED");
   }
}

class ForbiddenError extends AppError {
   constructor(message = "Forbidden") {
      super(message, 403, "FORBIDDEN");
   }
}

class NotFoundError extends AppError {
   constructor(message = "Not found") {
      super(message, 404, "NOT_FOUND");
   }
}

class ConflictError extends AppError {
   constructor(message = "Conflict") {
      super(message, 409, "CONFLICT");
   }
}

module.exports = {
   AppError,
   ValidationError,
   UnauthorizedError,
   ForbiddenError,
   NotFoundError,
   ConflictError,
};
