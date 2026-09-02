# Event Management

How events and registrations work in CampusHub — the data model, the backend endpoints,
the authorization gate, the frontend surfaces, and the seeds.

> Scope: this platform does **event registration** (and, later, announcements). There is no
> attendance tracking, no feedback or ratings, and no certificates — those were deliberately
> pruned. Per-club permissions come from the roles system; see [role-management.md](role-management.md).

---

## Concepts

- **Event** — something a club hosts. Lives in one club, created by one user, addressed by
  its `_id` (events have no slug; the club owns the slug namespace).
- **Status** — `draft` → `published` → `cancelled`. A draft is visible only to people who can
  manage events; publishing opens registration; cancelling keeps the event and its roster on
  the record. Only a draft can be deleted.
- **Visibility** — `public` or `private`. A public event is browsable campus-wide and open
  to any student; a private one is visible and open only to the club's own members. **Only a
  verified club can create public events** — an unverified club's events stay private until a
  superAdmin awards the ✓. New events default to `private`.
- **Registration** — one `EventRegistration` row per (user, event). A row is `registered`
  (holds a confirmed seat), `waitlisted` (queued), or `cancelled` (gave the seat up).
- **Capacity** — `0` means unlimited. When a capped event fills, further sign-ups either join
  the waitlist (if the organiser enabled one) or are refused.
- **Waitlist** — ordered by `registeredAt`. The longest-waiting person is promoted whenever a
  seat frees up, whether by a cancellation or by the organiser raising the cap.

---

## Who can do what

**Only students register.** Faculty and superAdmins organise events rather than take part in
them, so the register handler refuses them with a 403 and the UI hides the register control
from them. The API and the frontend enforce the same rule.

**Club membership depends on the event's visibility.** A public event is open to any student;
a private one needs an approved membership in the host club. Beyond that the gates are all
about the event itself: published, still open, and not full.

**Managing** an event is gated per-club by `requireClubPermission`, using keys that already
exist in the permission catalog:

| Permission | Grants |
| --- | --- |
| `events:create` | Create an event (draft or published) |
| `events:edit` | Edit an event, view its attendee roster |
| `events:publish` | Take a draft live so members can register |
| `events:cancel` | Cancel a live event, delete a draft |

As everywhere else, `superAdmin` and a club's `coordinator` role hold every permission
implicitly.

---

## Data model

**`backend/src/models/Event.js`**

| Field | Type | Notes |
| --- | --- | --- |
| `clubId` | ObjectId → Club | required |
| `createdBy` | ObjectId → User | required |
| `title` | String | required |
| `description` | String | ≤ 2000 chars |
| `bannerUrl` | String | not yet surfaced in the UI |
| `eventType` | String | `contest` \| `workshop` \| `hackathon` \| `seminar` \| `fun` |
| `startAt` / `endAt` | Date | required; `endAt` must be after `startAt` |
| `registrationDeadline` | Date | optional; defaults to `startAt` when unset |
| `venue.type` | String | `online` \| `offline` \| `hybrid` |
| `venue.location` | String | required for offline/hybrid |
| `venue.meetingUrl` | String | required for online/hybrid |
| `capacity` | Number | `0` = unlimited |
| `waitlistEnabled` | Boolean | |
| `status` | String | `draft` \| `published` \| `ongoing` \| `completed` \| `cancelled` |
| `visibility` | String | `public` \| `private`; defaults to `private` |
| `tags` | [String] | ≤ 10, searchable |
| `stats.registered` | Number | denormalized count of confirmed seats |

Indexes: `{ clubId, startAt }`, `{ eventType, status, startAt }`, `{ status, startAt }`, `{ tags }`.

> `ongoing` is in the status enum but nothing ever sets it — a leftover from the original model.

**`backend/src/models/EventRegistration.js`**

| Field | Type | Notes |
| --- | --- | --- |
| `eventId` | ObjectId → Event | required |
| `userId` | ObjectId → User | required |
| `status` | String | `registered` \| `waitlisted` \| `cancelled` |
| `registeredAt` | Date | drives waitlist order |
| `cancelledAt` | Date | |

Indexes: `{ eventId, userId }` **unique** — this index *is* the double-registration guard, so
no handler checks for one first; `{ userId, status }` powers "my events"; and
`{ eventId, status, registeredAt }` powers the roster and the oldest-waitlisted lookup.

---

## Backend endpoints

Handlers live in `backend/src/controllers/events/` — split across `events.controller.js`
(lifecycle), `registrations.controller.js` (seats), and `helpers.js` (serializers + shared
rules), with an `index.js` barrel mirroring `controllers/clubs`.

### Cross-club — `backend/src/routes/events.js`, mounted at `/api/events`

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/events` | Browse published events in active clubs. `q` (title + tags), `type`, `when=upcoming\|past`, `page`, `limit`. |
| GET | `/api/events/me` | The caller's own registrations. Declared **before** `/:eventId` so "me" isn't read as an id. |
| GET | `/api/events/:eventId` | One event. Drafts 404 for non-managers. |
| POST | `/api/events/:eventId/register` | Take a seat, or join the waitlist. Students only. |
| DELETE | `/api/events/:eventId/register` | Give the seat up; promotes the next person. |

### Club-scoped — the `EVENTS` section of `backend/src/routes/clubs.js`

| Method | Path | Gate |
| --- | --- | --- |
| GET | `/api/clubs/:slug/events` | any viewer (drafts filtered in the controller) |
| POST | `/api/clubs/:slug/events` | `events:create` |
| PATCH | `/api/clubs/:slug/events/:eventId` | `events:edit` |
| PATCH | `…/:eventId/status` | `events:publish` to publish, `events:cancel` to cancel |
| DELETE | `…/:eventId` | `events:cancel` (drafts only) |
| GET | `…/:eventId/attendees` | `events:edit` |

The status route carries two transitions with separate permissions, so its gate is chosen
from the request body — `events:publish` to take a draft live, `events:cancel` to call one
off. Validation therefore runs before the permission check on that one route.

The list endpoints also return a `viewer` object (`canCreate`, `canEdit`, `canPublish`,
`canCancel`) so the frontend knows which buttons to show without a second request.

---

## The rules that matter

**Taking a seat** is one atomic write. The capacity test and the counter bump happen together:

```js
Event.findOneAndUpdate(
   { _id, status: "published",
     $or: [{ capacity: 0 }, { $expr: { $lt: ["$stats.registered", "$capacity"] } }] },
   { $inc: { "stats.registered": 1 } },
)
```

If that returns `null` the event is full — the caller is waitlisted when the organiser allowed
it, refused with a 409 otherwise. Two simultaneous registrations therefore cannot both claim
the last seat. If the registration row then fails to write (a racing duplicate), the seat is
handed back.

**Registration is refused** when the caller isn't a student (403), the event isn't
`published`, the club isn't active, the deadline (or start time) has passed, or the caller
already holds a seat or a waitlist spot.

**Giving a seat up** decrements the counter, then promotes the longest-waiting person — so if
somebody was queued the count is unchanged, and the freed seat moves rather than disappearing.
Cancelling is refused once the event has started.

**Raising the capacity drains the waitlist.** `updateEvent` promotes up to the new headroom
(everyone, if capacity is set to unlimited) and returns `promotedCount`. Without this, raising
a cap would leave people stuck in the queue until someone cancelled. Both paths share
`promoteWaitlisted()` in `helpers.js`.

**Public events need a verified club.** `createEvent` and `updateEvent` both refuse
`visibility: "public"` when the host club isn't verified (403). Private events are always
allowed. Losing verification doesn't retroactively change existing events.

**Private events are invisible outside the club.** They're filtered out of the cross-club feed
entirely, hidden from `GET /api/clubs/:slug/events` for non-members, and `GET /api/events/:id`
404s for one — the same treatment drafts get. Managers see everything.

**A finished event is frozen.** Once `endAt` has passed it can't be edited or cancelled — it's
a record of what happened, not a plan. An event that has *started* but not finished is still
editable.

**Dates only move forward.** On create, `startAt` and any `registrationDeadline` must be in the
future. On edit the same rule applies only to a date that actually *changed*, because the edit
modal resubmits every field including the ones you didn't touch.

**Capacity can't drop below the seats already taken** (409), and a cancelled event can't be
edited (409). The UI hides Edit and Cancel on finished events rather than letting the click
fail.

**`club.stats.eventCount`** increments when an event goes live — at create-with-publish, or
when a draft is published. Nothing decrements it: drafts don't count, and drafts are the only
thing that can be deleted, so the counter can't drift.

---

## Frontend

| File | Role |
| --- | --- |
| `services/api/events.js` | 11 wrappers, exported as `eventsApi` |
| `utils/events.js` | Shared formatters + `eventState()` / `registerState()` — the register state machine lives here once so every surface agrees |
| `pages/Explore.jsx` | `/explore` — cross-club discovery (student-only route) |
| `pages/EventDetail.jsx` | `/events/:eventId` — hero, details, manager roster |
| `pages/EventForm.jsx` | `/clubs/:slug/events/new` — five-step create wizard |
| `components/EditEventModal.jsx` | Editing, as a modal (mirrors `EditClubModal`) |
| `pages/ClubDetail.jsx` | Events tab on a club |
| `pages/Home.jsx` | "Your events" on the dashboard |

`registerState()` returns one of six states — `register`, `waitlist`, `registered`,
`waitlisted`, `closed`, `full` — and each surface maps them onto its own button classes. A
state without an `action` isn't clickable.

**Creating is a page, editing is a modal**, matching how clubs work. The wizard follows
`.design/Event Creation Wizard.html` (Event type → Basic info → Schedule → Rules & access →
Review & publish) and reuses the club wizard's chrome by carrying both `create-club` and
`create-event` classes — that chrome is ~800 lines of CSS not worth duplicating. Its live
preview renders the same `.event-card` markup the Explore feed uses, which is why those card
styles sit outside `.explore` in `App.css`.

All event styles live in `frontend/src/App.css` alongside everything else — no per-page CSS.

---

## Seeds

`backend/src/scripts/seedEvents.js` (`npm run db:seed:events`, part of the `db:seed` chain,
run after `db:seed:users`).

Every active club gets **two** events, and which pair alternates by club index so that between
them the clubs cover every state the UI has to render:

| Club index | Events |
| --- | --- |
| even | Flagship 24h Hackathon (capped at 3, waitlist on, deliberately oversubscribed) + Season Recap (past, `completed`) |
| odd | Intro Workshop (uncapped, open) + Committee Planning Sync (`draft`) |

Sign-ups come from **student** members only — faculty run events rather than join them, and
since the UI hides the register control from them, a seeded faculty seat could never be
cancelled. The script also recomputes each club's `stats.eventCount` from what actually exists.

Re-running is safe: events upsert by `{ clubId, title }` and registrations are rebuilt.

---

## Edge cases & notes

- **Deleting a club** cascades to its events and their registrations
  (`clubs.controller.deleteClub`).
- **Cancelled events keep their roster** — it's the record of who had signed up, and members
  need to see that it was called off. `/api/events/me` therefore still lists a cancelled event
  you registered for; the UI should badge it rather than hide it.
- **Dropping a Mongoose schema field doesn't remove it from existing documents**, and a
  `$unset` through a strict Mongoose model is silently ignored for a path no longer in the
  schema. Removing `stats.attended` and `attendedAt` needed the raw driver. A `db:reset`
  produces clean documents either way.
- **No tests.** The whole feature was verified by hand against a running server.
