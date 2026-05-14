// Thin wrappers around /api/auth/* endpoints. The apiClient interceptor unwraps
// the response envelope, so each call returns just the `data` payload (or null).
import { apiClient } from "./client";

export async function register({ email, password, name }) {
   const { data } = await apiClient.post("/auth/register", {
      email,
      password,
      name,
   });
   return data;
}

export async function login({ email, password }) {
   const { data } = await apiClient.post("/auth/login", { email, password });
   return data;
}

export async function logout() {
   const { data } = await apiClient.post("/auth/logout");
   return data;
}

export async function me() {
   const { data } = await apiClient.get("/auth/me");
   return data;
}

export async function verifyEmail(token) {
   const { data } = await apiClient.get("/auth/verify-email", {
      params: { token },
   });
   return data;
}

export async function resendVerification(email) {
   const { data } = await apiClient.post("/auth/resend-verification", {
      email,
   });
   return data;
}

export async function forgotPassword(email) {
   const { data } = await apiClient.post("/auth/forgot-password", { email });
   return data;
}

export async function resetPassword({ token, password }) {
   const { data } = await apiClient.post("/auth/reset-password", {
      token,
      password,
   });
   return data;
}
