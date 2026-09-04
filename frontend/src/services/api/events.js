// Wrappers around /api/events/* and the club-scoped /api/clubs/:slug/events/* endpoints.
// Events are addressed by id (not slug) — the club owns the slug namespace, events don't.
import { apiClient, qs } from "./client";


// ── Club-scoped ──────────────────────────────────────────────────────

// One club's events. Drafts come back only for viewers who can manage them; the
// response also carries a `viewer` object (canCreate/canEdit/canPublish/canCancel).
export async function listClubEvents(
   slug,
   { status, type, when, sort, page, limit } = {},
) {
   const { data } = await apiClient.get(
      `/clubs/${encodeURIComponent(slug)}/events${qs({ status, type, when, sort, page, limit })}`,
   );
   return data;
}

// Create an event. `publish: true` skips the draft state.
export async function createEvent(slug, body) {
   const { data } = await apiClient.post(
      `/clubs/${encodeURIComponent(slug)}/events`,
      body,
   );
   return data;
}

export async function updateEvent(slug, eventId, patch) {
   const { data } = await apiClient.patch(
      `/clubs/${encodeURIComponent(slug)}/events/${encodeURIComponent(eventId)}`,
      patch,
   );
   return data;
}

// Publish a draft or call an event off (status: "published" | "cancelled").
export async function setEventStatus(slug, eventId, status) {
   const { data } = await apiClient.patch(
      `/clubs/${encodeURIComponent(slug)}/events/${encodeURIComponent(eventId)}/status`,
      { status },
   );
   return data;
}

// Drafts only — a published event is cancelled instead.
export async function deleteEvent(slug, eventId) {
   const { data } = await apiClient.delete(
      `/clubs/${encodeURIComponent(slug)}/events/${encodeURIComponent(eventId)}`,
   );
   return data;
}

// Who signed up (needs events:edit). `q` searches the roster by name or email.
export async function listAttendees(
   slug,
   eventId,
   { q, status, page, limit } = {},
) {
   const { data } = await apiClient.get(
      `/clubs/${encodeURIComponent(slug)}/events/${encodeURIComponent(eventId)}/attendees${qs({ q, status, page, limit })}`,
   );
   return data;
}

// ── Cross-club ───────────────────────────────────────────────────────

// Browse published events across every active club.
// `clubs: "not-mine"` drops the clubs you've joined; `openOnly: "true"` drops anything
// you couldn't take a seat or a waitlist place at. They're independent.
export async function listEvents({
   q,
   type,
   clubs,
   openOnly,
   when,
   sort,
   page,
   limit,
} = {}) {
   const { data } = await apiClient.get(
      `/events${qs({ q, type, clubs, openOnly, when, sort, page, limit })}`,
   );
   return data;
}

// The caller's own registrations — drives the dashboard widget.
export async function listMyEvents({
   when,
   q,
   type,
   status,
   sort,
   page,
   limit,
} = {}) {
   const { data } = await apiClient.get(
      `/events/me${qs({ when, q, type, status, sort, page, limit })}`,
   );
   return data;
}

export async function getEvent(eventId) {
   const { data } = await apiClient.get(
      `/events/${encodeURIComponent(eventId)}`,
   );
   return data;
}

// Take a seat (or join the waitlist when the event is full).
export async function registerForEvent(eventId) {
   const { data } = await apiClient.post(
      `/events/${encodeURIComponent(eventId)}/register`,
   );
   return data;
}

export async function unregisterFromEvent(eventId) {
   const { data } = await apiClient.delete(
      `/events/${encodeURIComponent(eventId)}/register`,
   );
   return data;
}
