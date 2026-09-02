// Barrel export — consumers import everything from "../services".
export { ApiError } from "./api/errors";
export { apiClient } from "./api/client";
// Grouped namespace so call sites read as authApi.login(), authApi.me(), etc.
export * as authApi from "./api/auth";
export * as profileApi from "./api/profile";
export * as clubsApi from "./api/clubs";
export * as eventsApi from "./api/events";
export * as announcementsApi from "./api/announcements";
export * as adminApi from "./api/admin";
