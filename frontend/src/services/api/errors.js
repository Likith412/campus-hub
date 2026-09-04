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

// The backend ships per-field Zod reasons in `details.fieldErrors`; the top-level
// message for those is the useless literal "Invalid request body". Prefer the field
// reasons, then the server's message, then the caller's fallback.
export function errMessage(err, fallback) {
   if (!(err instanceof ApiError)) return fallback;
   const reasons = Object.values(err.details?.fieldErrors || {})
      .flat()
      .filter(Boolean);
   return reasons.length ? reasons.join(" ") : err.message || fallback;
}

// Per-field validation reasons, keyed by field name, for forms that can show them
// under the input. Empty object when the failure wasn't a validation error.
export function fieldErrors(err) {
   if (!(err instanceof ApiError)) return {};
   const fields = err.details?.fieldErrors || {};
   return Object.fromEntries(
      Object.entries(fields)
         .map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
         .filter(([, v]) => v),
   );
}
