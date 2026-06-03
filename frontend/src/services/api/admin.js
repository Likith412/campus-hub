// Wrappers around /api/admin/* endpoints (superAdmin-only).
import { apiClient } from "./client";

export async function listUsers({ role, q, status, page, limit } = {}) {
   const params = new URLSearchParams();
   if (role) params.set("role", role);
   if (q) params.set("q", q);
   if (status) params.set("status", status);
   if (page) params.set("page", String(page));
   if (limit) params.set("limit", String(limit));
   const qs = params.toString();
   const { data } = await apiClient.get(`/admin/users${qs ? `?${qs}` : ""}`);
   return data;
}

export async function getFacultyStats() {
   const { data } = await apiClient.get("/admin/faculty/stats");
   return data;
}

export async function createFaculty({ name, email }) {
   const { data } = await apiClient.post("/admin/users", { name, email });
   return data;
}

export async function setUserActive(id, isActive) {
   const { data } = await apiClient.patch(
      `/admin/users/${encodeURIComponent(id)}/active`,
      { isActive },
   );
   return data;
}
