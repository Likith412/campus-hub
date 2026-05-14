// Barrel export — consumers import everything from "../services".
export { ApiError } from "./api/errors";
export { apiClient } from "./api/client";
// Grouped namespace so call sites read as authApi.login(), authApi.me(), etc.
export * as authApi from "./api/auth";
