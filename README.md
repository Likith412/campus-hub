# Campus Hub

A campus club and event management platform. Students discover and join clubs, register for
events and build a public profile; faculty coordinate clubs, delegate authority through custom
per-club roles and run events; a super admin governs the institute.

Two apps in one repository:

| App         | Stack                                         | Dev port |
| ----------- | --------------------------------------------- | -------- |
| `backend/`  | Node.js, Express 5, MongoDB (Mongoose), Redis | `8000`   |
| `frontend/` | React 19, Vite, React Router 7, Axios         | `5173`   |

---

## Features

**Accounts and auth**

- Email + password registration with a verification link; signup stays minimal and the rest of
  the profile is filled in after login.
- Access JWT (short-lived) + refresh token in an httpOnly cookie, rotated on refresh. Concurrent
  401s share a single refresh call on the client.
- Password reset by email, password change (revokes every other session), active-session list
  with per-device revoke, and account soft-delete.

**Clubs**

- Browse and search clubs by category; join (open / request / invite-only) or just follow for
  announcements.
- Member moderation: approve, reject, re-invite, add directly, remove.
- Custom per-club roles with a permission catalogue and a numeric weight that bounds who can act
  on whom.
- Club profile editing, coordinator assignment, and super-admin suspension / archival.

**Events**

- Draft → published → cancelled lifecycle, with event types (contest, workshop, hackathon,
  seminar, fun), online / offline / hybrid venues, capacity and an optional waitlist.
- Public events are browsable campus-wide; private ones are limited to the club's members. Only a
  verified club may publish a public event.
- Registration and cancellation, attendee rosters for organisers, and a personal "my events" view.

**Announcements**

- Per-club board with pinning. Members see everything; everyone else sees only public notices.
- Public notices are emailed to followers and registrants through a background queue.

**Administration**

- Super-admin area: faculty and student directories with stats, all clubs, all events, and
  per-club controls.

---

## Getting started

### Prerequisites

- Node.js 20+
- Docker (for MongoDB and Redis), or your own local instances

### 1. Start the datastores

```bash
docker compose up -d mongodb redis
```

MongoDB is published on `27016` and Redis on `6378` to avoid clashing with anything already
running on the default ports.

### 2. Backend

```bash
cd backend
cp .env.example .env      # then fill in the secrets — see below
npm install
npm run db:init           # build indexes + seed the super admin
npm run db:seed           # optional: demo clubs, users, roles, events, announcements
npm run dev
```

The API comes up on `http://localhost:8000`; `GET /` is a health check.

Generate the two JWT secrets with:

```bash
openssl rand -hex 32
```

`SUPERADMIN_EMAIL` and `SUPERADMIN_PASSWORD` must be set before `db:init` — that script is the
only way a super admin is created, there is no signup path for one.

Leave `SMTP_HOST` blank and verification / reset emails are printed to the console, so both flows
stay usable without a mail account.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs on `http://localhost:5173`. Point it at a non-default API with `VITE_API_URL` in
`frontend/.env.local` (the client appends `/api` itself); it defaults to `http://localhost:8000`.

### Demo accounts

`npm run db:seed` creates ten faculty and thirty students across twelve clubs, all sharing the
password `Password@12345` (override with `SEED_USER_PASSWORD`).

| Role                  | Example login                          |
| --------------------- | -------------------------------------- |
| Faculty (coordinator) | `priya.nair@college.edu`               |
| Student               | `aarav.sharma@college.edu`             |
| Super admin           | whatever you set as `SUPERADMIN_EMAIL` |

---

## Environment variables

All backend variables are documented inline in [backend/.env.example](backend/.env.example). The
ones you must set:

| Variable                                   | Purpose                                           |
| ------------------------------------------ | ------------------------------------------------- |
| `DATABASE_URI`                             | MongoDB connection string                         |
| `REDIS_URL`                                | Redis — token blacklist, email queue              |
| `JWT_ACCESS_SECRET`                        | Access-token signing (refresh tokens are opaque)  |
| `FRONTEND_URL`                             | CORS allow-list and the links inside emails       |
| `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` | Bootstrap admin for `db:init`                     |

Email is transport-switched on `NODE_ENV`: SMTP via nodemailer in development, Brevo's HTTPS API
in production (most free hosts block outbound SMTP), falling back to console output when neither
is configured.

---

## Database scripts

Run from `backend/`:

| Command            | What it does                                                       |
| ------------------ | ------------------------------------------------------------------ |
| `npm run db:init`  | Sync every model's indexes and upsert the super admin. Idempotent. |
| `npm run db:seed`  | Seed clubs, users, roles, events and announcements in order.       |
| `npm run db:drop`  | Drop the database.                                                 |
| `npm run db:reset` | `db:drop` → `db:init` → `db:seed`.                                 |

Individual seeds are also available: `db:seed:clubs`, `db:seed:users`, `db:seed:roles`,
`db:seed:events`, `db:seed:announcements`.

---

## Roles and permissions

Two independent layers; a request must clear both that apply to it.

**Platform role** — stored on `User.role` (a Mongoose discriminator key, so accounts are created
through the role's own model) and enforced by `requireRole`:

| Role         | Powers                                                                |
| ------------ | --------------------------------------------------------------------- |
| `student`    | Own profile, browse clubs and events, join clubs, register for events |
| `faculty`    | Create clubs, coordinate the ones they are assigned to                |
| `superAdmin` | Unrestricted; institute-wide administration                           |

**Per-club role** — a `ClubRole` referenced by the user's `ClubMembership`, enforced by
`requireClubPermission`. Every club is born with two system roles: `coordinator` (weight 100,
implicitly holds every permission) and `member` (weight 0, none). Coordinators can add custom
roles at weights 1–99 holding any subset of the catalogue in
[backend/src/constants/clubPermissions.js](backend/src/constants/clubPermissions.js):

```
club:edit             members:moderate       members:assign-role    roles:manage
announcements:create  announcements:pin      announcements:delete
events:create         events:edit            events:publish         events:cancel
```

Weight is both a display rank and the hierarchy gate: you can only act on members ranked strictly
below you, and role assignment is bounded at both ends — the member's current role _and_ the
target role must sit below your own weight. A club must always keep at least one coordinator, and
only faculty accounts may hold that role.

---

## API

Everything is mounted under `/api` and answers in a `{ success, message, data }` envelope, which
the frontend client unwraps.

| Prefix                             | Contents                                                                     |
| ---------------------------------- | ---------------------------------------------------------------------------- |
| `/api/auth`                        | Register, login, refresh, logout, `/me`, email verification                  |
| `/api/auth/*`, `/api/profile/me/*` | Password reset and change, sessions, account deletion                        |
| `/api/profile`                     | Own profile, skills, club history; public profiles at `/api/profile/:handle` |
| `/api/clubs`                       | Browse, create, join, follow; members, roles and announcements per club      |
| `/api/events`                      | Cross-club browse, event detail, registration, `/api/events/me`              |
| `/api/announcements`               | Cross-club digest                                                            |
| `/api/admin`                       | Super-admin users, clubs and events with stats                               |
| `/api/permissions/catalog`         | The grantable per-club permission list for the UI picker                     |

Club-scoped event writes live under `/api/clubs/:slug/events`, where the club can be resolved for
the permission check.

---

## Project structure

```
backend/src
├── app.js              Express pipeline and route mounting
├── server.js           Boot: DB → Redis → queue → HTTP, plus graceful shutdown
├── config/             database, redis, queue, env
├── constants/          platform roles, club permission catalogue
├── controllers/        auth, accountSecurity, profile, clubs, events, announcements, admin
├── middlewares/        authenticate, requireRole, requireClubPermission, validate
├── models/             User (+ discriminators), Club, ClubRole, ClubMembership, Event, ...
├── routes/             one router per feature area
├── scripts/            db:init, db:reset and the seeds
├── services/           emailService
├── utils/              jwt, cookies, password, tokens, errors, responses
└── validators/         zod schemas per feature

frontend/src
├── App.jsx             Route table and the role guards
├── App.css             All styles live here — no per-page stylesheets
├── components/         Shared UI + layout (AppShell, Sidebar, Topbar, ClubSwitcher)
├── contexts/           Auth, ActiveClub, Toast, Confirm
├── hooks/              useDebounced, useLatestRequest, useModalChrome
├── pages/              One component per route
├── services/api/       Axios client with the refresh interceptor, one module per feature
└── utils/              Formatting and nav helpers
```

---

## Deployment

**Render** — [render.yaml](render.yaml) is a Blueprint that provisions the API, the static SPA and
a Key Value (Redis) store. MongoDB is not included; create a free Atlas cluster and paste its
connection string into `DATABASE_URI`. Two passes are needed: the services have no URLs until they
exist, so set `FRONTEND_URL` on the API and `VITE_API_URL` on the site after the first deploy and
let both redeploy.

**Docker** — `docker compose up` builds and runs all four services (MongoDB, Redis, API, SPA)
with the source bind-mounted for live reload.
