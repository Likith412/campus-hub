// Wrappers around /api/clubs/* endpoints.
import { apiClient } from "./client";

export async function listClubs({ q, category, sort, verified, page, limit } = {}) {
   const params = new URLSearchParams();
   if (q) params.set("q", q);
   if (category) params.set("category", category);
   if (sort) params.set("sort", sort);
   if (verified) params.set("verified", verified);
   if (page) params.set("page", String(page));
   if (limit) params.set("limit", String(limit));
   const qs = params.toString();
   const { data } = await apiClient.get(`/clubs${qs ? `?${qs}` : ""}`);
   return data;
}

export async function createClub(body) {
   const { data } = await apiClient.post("/clubs", body);
   return data;
}

export async function setVerification(slug, verified) {
   const { data } = await apiClient.patch(
      `/clubs/${encodeURIComponent(slug)}/verification`,
      { verified },
   );
   return data;
}

export async function setStatus(slug, status) {
   const { data } = await apiClient.patch(
      `/clubs/${encodeURIComponent(slug)}/status`,
      { status },
   );
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

// Accept or reject a join request (status: "approved" | "rejected").
export async function setMemberStatus(slug, userId, status) {
   const { data } = await apiClient.patch(
      `/clubs/${encodeURIComponent(slug)}/members/${encodeURIComponent(userId)}/status`,
      { status },
   );
   return data;
}

// Change an approved member's role (role: "coordinator" | "member").
export async function setMemberRole(slug, userId, role) {
   const { data } = await apiClient.patch(
      `/clubs/${encodeURIComponent(slug)}/members/${encodeURIComponent(userId)}/role`,
      { role },
   );
   return data;
}

export async function removeMember(slug, userId) {
   const { data } = await apiClient.delete(
      `/clubs/${encodeURIComponent(slug)}/members/${encodeURIComponent(userId)}`,
   );
   return data;
}
