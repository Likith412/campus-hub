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

// Edit a club (coordinator of the club, or superAdmin). `patch` is a partial club body.
export async function updateClub(slug, patch) {
   const { data } = await apiClient.patch(
      `/clubs/${encodeURIComponent(slug)}`,
      patch,
   );
   return data;
}

// superAdmin: assign another faculty as a per-club coordinator.
export async function addCoordinator(slug, userId) {
   const { data } = await apiClient.post(
      `/clubs/${encodeURIComponent(slug)}/coordinators`,
      { userId },
   );
   return data;
}

// superAdmin: remove a coordinator from the club (a faculty can't stay on as a member).
export async function removeCoordinator(slug, userId) {
   const { data } = await apiClient.delete(
      `/clubs/${encodeURIComponent(slug)}/coordinators/${encodeURIComponent(userId)}`,
   );
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

// superAdmin or the creating faculty: permanently delete a club + its memberships and events.
export async function deleteClub(slug) {
   const { data } = await apiClient.delete(`/clubs/${encodeURIComponent(slug)}`);
   return data;
}

export async function getClub(slug) {
   const { data } = await apiClient.get(`/clubs/${encodeURIComponent(slug)}`);
   return data;
}

export async function listMembers(
   slug,
   { q, role, status, sort, page, limit } = {},
) {
   const params = new URLSearchParams();
   if (q) params.set("q", q);
   if (role) params.set("role", role);
   if (status) params.set("status", status);
   if (sort) params.set("sort", sort);
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
