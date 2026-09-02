// Wrappers around the club notice board (/api/clubs/:slug/announcements) and the
// cross-club digest (/api/announcements) that feeds the dashboard.
import { apiClient } from "./client";

function qs(params) {
   const search = new URLSearchParams();
   Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") search.set(k, String(v));
   });
   const s = search.toString();
   return s ? `?${s}` : "";
}

// One club's board. Members see every notice; everyone else sees the public ones.
// The response carries a `viewer` object (canPost / canPin / canDeleteAny / isMember).
export async function listClubAnnouncements(
   slug,
   { q, visibility, page, limit } = {},
) {
   const { data } = await apiClient.get(
      `/clubs/${encodeURIComponent(slug)}/announcements${qs({ q, visibility, page, limit })}`,
   );
   return data;
}

// Notices attached to one event — shown on its detail page.
export async function listEventAnnouncements(eventId) {
   const { data } = await apiClient.get(
      `/events/${encodeURIComponent(eventId)}/announcements`,
   );
   return data;
}

export async function createAnnouncement(slug, body) {
   const { data } = await apiClient.post(
      `/clubs/${encodeURIComponent(slug)}/announcements`,
      body,
   );
   return data;
}

export async function setAnnouncementPinned(slug, id, pinned) {
   const { data } = await apiClient.patch(
      `/clubs/${encodeURIComponent(slug)}/announcements/${encodeURIComponent(id)}/pin`,
      { pinned },
   );
   return data;
}

export async function deleteAnnouncement(slug, id) {
   const { data } = await apiClient.delete(
      `/clubs/${encodeURIComponent(slug)}/announcements/${encodeURIComponent(id)}`,
   );
   return data;
}

// Everything from the clubs you belong to, newest first.
export async function listMyAnnouncements({ page, limit } = {}) {
   const { data } = await apiClient.get(`/announcements${qs({ page, limit })}`);
   return data;
}
