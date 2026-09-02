// Wrappers around /api/admin/* endpoints (superAdmin-only).
import { apiClient } from "./client";

export async function listUsers({ role, q, status, sort, page, limit } = {}) {
   const params = new URLSearchParams();
   if (role) params.set("role", role);
   if (q) params.set("q", q);
   if (status) params.set("status", status);
   if (sort) params.set("sort", sort);
   if (page) params.set("page", String(page));
   if (limit) params.set("limit", String(limit));
   const qs = params.toString();
   const { data } = await apiClient.get(`/admin/users${qs ? `?${qs}` : ""}`);
   return data;
}

export async function getStudentStats() {
   const { data } = await apiClient.get("/admin/students/stats");
   return data;
}

export async function getFacultyStats() {
   const { data } = await apiClient.get("/admin/faculty/stats");
   return data;
}

// Every club across the institute (any status) — superAdmin "All Clubs" view.
export async function listClubs({
   q,
   category,
   status,
   sort,
   page,
   limit,
} = {}) {
   const params = new URLSearchParams();
   if (q) params.set("q", q);
   if (category) params.set("category", category);
   if (status) params.set("status", status);
   if (sort) params.set("sort", sort);
   if (page) params.set("page", String(page));
   if (limit) params.set("limit", String(limit));
   const qs = params.toString();
   const { data } = await apiClient.get(`/admin/clubs${qs ? `?${qs}` : ""}`);
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

// Institute-wide event listing (superAdmin only).
export async function listEvents({
   q,
   club,
   type,
   status,
   when,
   sort,
   page,
   limit,
} = {}) {
   const params = new URLSearchParams();
   Object.entries({ q, club, type, status, when, sort, page, limit }).forEach(
      ([k, v]) => {
         if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
      },
   );
   const qs = params.toString();
   const { data } = await apiClient.get(`/admin/events${qs ? `?${qs}` : ""}`);
   return data;
}
