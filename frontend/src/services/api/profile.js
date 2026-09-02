// Wrappers around /api/profile/* endpoints. Each tab/panel calls only what it needs
// — the backend slices endpoints per concern so we can fetch lazily.
import { apiClient } from "./client";

export async function getMe() {
   const { data } = await apiClient.get("/profile/me");
   return data;
}

export async function updateMe(payload) {
   const { data } = await apiClient.patch("/profile/me", payload);
   return data;
}

// Anyone's profile, by username or user id.
export async function getProfile(handle) {
   const { data } = await apiClient.get(
      `/profile/${encodeURIComponent(handle)}`,
   );
   return data;
}

// The profile's event panel pages on its own — page 1 already ships with getProfile().
export async function getProfileEvents(handle, page) {
   const { data } = await apiClient.get(
      `/profile/${encodeURIComponent(handle)}/events?page=${page}`,
   );
   return data;
}

export async function getStats() {
   const { data } = await apiClient.get("/profile/me/stats");
   return data;
}

export async function getSkills() {
   const { data } = await apiClient.get("/profile/me/skills");
   return data;
}

export async function updateSkills(skills) {
   const { data } = await apiClient.put("/profile/me/skills", { skills });
   return data;
}

export async function getHeatmap() {
   const { data } = await apiClient.get("/profile/me/heatmap");
   return data;
}

export async function getRecentActivity() {
   const { data } = await apiClient.get("/profile/me/recent-activity");
   return data;
}

// relation: "member" (default) | "following" | "all"
export async function getClubs({ relation } = {}) {
   const { data } = await apiClient.get(
      `/profile/me/clubs${relation ? `?relation=${relation}` : ""}`,
   );
   return data;
}

export async function getAchievementsSummary() {
   const { data } = await apiClient.get("/profile/me/achievements/summary");
   return data;
}

export async function getPreferences() {
   const { data } = await apiClient.get("/profile/me/preferences");
   return data;
}

export async function updatePreferences(patch) {
   const { data } = await apiClient.patch("/profile/me/preferences", patch);
   return data;
}

export async function changePassword({ currentPassword, newPassword }) {
   const { data } = await apiClient.post("/profile/me/change-password", {
      currentPassword,
      newPassword,
   });
   return data;
}

export async function getSessions() {
   const { data } = await apiClient.get("/profile/me/sessions");
   return data;
}

export async function revokeSession(id) {
   const { data } = await apiClient.delete(`/profile/me/sessions/${id}`);
   return data;
}

export async function revokeOtherSessions() {
   const { data } = await apiClient.post("/profile/me/sessions/revoke-others");
   return data;
}

export async function deleteAccount() {
   const { data } = await apiClient.delete("/profile/me");
   return data;
}
