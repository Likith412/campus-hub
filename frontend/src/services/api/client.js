import axios from "axios";
import { ApiError } from "./errors";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

// withCredentials: send/receive httpOnly auth cookies on every request.
export const apiClient = axios.create({
   baseURL: BASE_URL,
   withCredentials: true,
   timeout: 10000,
});

// Single-flight: concurrent 401s share one /auth/refresh call to avoid token rotation races.
let refreshPromise = null;

async function refreshAccessToken() {
   if (!refreshPromise) {
      // Use raw axios — going through apiClient would re-enter this interceptor.
      refreshPromise = axios
         .post(`${BASE_URL}/auth/refresh`, {}, { withCredentials: true })
         .finally(() => {
            refreshPromise = null;
         });
   }
   return refreshPromise;
}

apiClient.interceptors.response.use(
   // Unwrap the backend's { success, message, data } envelope so callers get the payload directly.
   (res) => {
      if (res.data && typeof res.data === "object" && "data" in res.data) {
         res.data = res.data.data ?? null;
      }
      return res;
   },
   async (error) => {
      const original = error.config;
      const status = error.response?.status;
      const isRefreshCall = original?.url?.includes("/auth/refresh");

      // On 401, try a silent refresh + retry once. Skip if it's the refresh call itself
      // (would loop) or we've already retried this request.
      if (status === 401 && !original?._retry && !isRefreshCall) {
         original._retry = true;
         try {
            await refreshAccessToken();
            return apiClient(original);
         } catch {
            // Refresh failed → user is really logged out; fall through to the normalized error.
         }
      }

      // Normalize axios errors into our ApiError shape so callers can `catch (e) { e.code === ... }`.
      const data = error.response?.data;
      throw new ApiError({
         status: status ?? 0,
         code: data?.error?.code ?? "NETWORK_ERROR",
         message: data?.error?.message ?? error.message ?? "Request failed",
         details: data?.error?.details,
      });
   },
);
