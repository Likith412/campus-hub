// Thrown by the apiClient response interceptor. Normalizes axios errors so
// callers can branch on `status` / `code` without knowing about axios internals.
export class ApiError extends Error {
   constructor({ status, code, message, details }) {
      super(message);
      this.name = "ApiError";
      this.status = status; // HTTP status; 0 for network failures
      this.code = code; // backend error code, e.g. "INVALID_CREDENTIALS"
      this.details = details; // optional validation field info from the backend
   }
}
