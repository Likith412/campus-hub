// Wrappers around /api/clubs/* endpoints.
import { apiClient } from "./client";

export async function listClubs({ q, category, sort, page, limit } = {}) {
   const params = new URLSearchParams();
   if (q) params.set("q", q);
   if (category) params.set("category", category);
   if (sort) params.set("sort", sort);
   if (page) params.set("page", String(page));
   if (limit) params.set("limit", String(limit));
   const qs = params.toString();
   const { data } = await apiClient.get(`/clubs${qs ? `?${qs}` : ""}`);
   return data;
}

export async function joinClub(slug) {
   const { data } = await apiClient.post(
      `/clubs/${encodeURIComponent(slug)}/join`,
   );
   return data;
}

export async function leaveClub(slug) {
   const { data } = await apiClient.delete(
      `/clubs/${encodeURIComponent(slug)}/membership`,
   );
   return data;
}

export async function getClub(slug) {
   const { data } = await apiClient.get(`/clubs/${encodeURIComponent(slug)}`);
   return data;
}

export async function listMembers(slug, { q, role, status, page, limit } = {}) {
   const params = new URLSearchParams();
   if (q) params.set("q", q);
   if (role) params.set("role", role);
   if (status) params.set("status", status);
   if (page) params.set("page", String(page));
   if (limit) params.set("limit", String(limit));
   const qs = params.toString();
   const { data } = await apiClient.get(
      `/clubs/${encodeURIComponent(slug)}/members${qs ? `?${qs}` : ""}`,
   );
   return data;
}

export async function updateMember(slug, userId, patch) {
   const { data } = await apiClient.patch(
      `/clubs/${encodeURIComponent(slug)}/members/${encodeURIComponent(userId)}`,
      patch,
   );
   return data;
}

export async function removeMember(slug, userId) {
   const { data } = await apiClient.delete(
      `/clubs/${encodeURIComponent(slug)}/members/${encodeURIComponent(userId)}`,
   );
   return data;
}
