# Campus Hub

A campus club and event management platform. Students discover and join clubs, register for
events and build a public profile; faculty coordinate clubs, delegate authority through custom
per-club roles and run events; a super admin governs the institute.

**Live demo → https://campus-hub-web.onrender.com**

> Hosted on Render's free tier, so the first request may take up to a minute while the instance
> wakes up. It is not broken — give it a moment and reload.

---

## Try it as each kind of user

| Role                 | Email                       | Password                   | What you can see                                                                    |
| -------------------- | --------------------------- | -------------------------- | ----------------------------------------------------------------------------------- |
| **Student**          | `aarav.sharma@college.edu`  | `Password@12345`           | Dashboard, club discovery, event registration, announcements digest, public profile |
| **Student** (busier) | `vivaan.reddy@college.edu`  | `Password@12345`           | Member of three clubs — better for seeing the digest and "my events" fill up        |
| **Faculty**          | `priya.nair@college.edu`    | `Password@12345`           | Coordinates two clubs: members, roles, events, announcements, club controls         |
| **Faculty**          | `deepak.shetty@college.edu` | `Password@12345`           | Coordinates Sports Council — a smaller club, easier to read end to end              |
| **Super admin**      | `superadmin@college.edu`    | `supersecurepassword12345` | Institute-wide: all faculty, all students, all clubs, all events                    |

Every seeded faculty and student shares `Password@12345`. The super admin is the exception — it
is created by `db:init` from `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` rather than by the seed,
so it has its own.

> **Please explore freely, but go easy on the destructive bits.** Join clubs, register for
> events, post announcements, create and publish an event — all of that is what the demo is for.
> Deleting a club, deactivating accounts or removing coordinators affects everyone who visits
> after you, so please leave those alone.

<details>
<summary>All 40 demo accounts</summary>

The seed creates **10 faculty** and **30 students** across **12 clubs**, all sharing
`Password@12345`. The faculty are:

`priya.nair@` · `rahul.deshpande@` · `meera.krishnan@` · `arun.venkatesh@` · `sanjay.rao@` ·
`kavya.menon@` · `ananth.subramanian@` · `farah.qureshi@` · `vikram.joshi@` · `deepak.shetty@`
(all `@college.edu`)

Student emails follow `firstname.lastname@college.edu` — the full list is in
[`backend/src/scripts/seedData/people.js`](backend/src/scripts/seedData/people.js).

</details>

### A five-minute tour

1. **Sign in as `aarav.sharma@college.edu`.** The dashboard shows what he is registered for,
   what his clubs have announced and what else is on. Open **Explore** and register for an
   event — watch the seat count move and the card flip to "✓ In".
2. **Open a club you are not in** and hit Join. An _open_ club admits you instantly; a
   _request_ club puts you in a pending queue; an _invite-only_ club refuses.
3. **Sign in as `priya.nair@college.edu`** (faculty). The sidebar is now scoped to a club she
   coordinates. Approve the pending request you just made, then look at **Roles** — create a
   role, tick a few permissions, and assign it to a member.
4. **Create an event** from the wizard, save it as a draft, then publish it. Cancel it and note
   that everyone holding a seat is emailed.
5. **Sign in as `superadmin@college.edu`** for the institute view: every faculty, student, club
   and event, plus the controls to verify or suspend a club.

---

## What it does

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

## How it is built

| App         | Stack                                         | Dev port |
| ----------- | --------------------------------------------- | -------- |
| `backend/`  | Node.js, Express 5, MongoDB (Mongoose), Redis | `8000`   |
| `frontend/` | React 19, Vite, React Router 7, Axios         | `5173`   |

72 REST endpoints across 8 route modules, 11 Mongoose models, and a per-club permission system
that the server enforces on every write. Emails go through a Bull queue on Redis so a slow mail
provider never blocks a request.

**Deeper documentation lives in [`docs/`](docs/):**

| Document                                 | What it covers                                                   |
| ---------------------------------------- | ---------------------------------------------------------------- |
| [Architecture](docs/architecture.md)     | Request path, module layout, data model, deployment topology     |
| [Business logic](docs/business-logic.md) | The domain rules: state machines, invariants, who may do what    |
| [Permissions](docs/permissions.md)       | Roles, the permission catalogue, and how weight bounds authority |
| [API reference](docs/api.md)             | Every endpoint, its guard and its shape                          |
| [Data model](docs/data-model.md)         | Collections, relationships, indexes and denormalised counters    |

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

| Variable                                   | Purpose                                          |
| ------------------------------------------ | ------------------------------------------------ |
| `DATABASE_URI`                             | MongoDB connection string                        |
| `REDIS_URL`                                | Redis — token blacklist, email queue             |
| `JWT_ACCESS_SECRET`                        | Access-token signing (refresh tokens are opaque) |
| `FRONTEND_URL`                             | CORS allow-list and the links inside emails      |
| `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` | Bootstrap admin for `db:init`                    |

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

Two independent layers: a **platform role** on `User.role` (`student` / `faculty` / `superAdmin`,
a Mongoose discriminator key) enforced by `requireRole`, and a **per-club role** referenced by the
membership and enforced by `requireClubPermission`. Every club is born with `coordinator`
(weight 100, implicitly holds everything) and `member` (weight 0, none); custom roles sit at
weights 1–99 holding any subset of an 11-entry catalogue.

Weight bounds authority in both directions, and you can never grant a permission you do not hold
yourself — see **[docs/permissions.md](docs/permissions.md)** for the full model and the checks
behind it.

## API

72 endpoints under `/api`, all answering in a `{ success, message, data }` envelope that the
frontend client unwraps. The full table — every path with its guards — is in
**[docs/api.md](docs/api.md)**.

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
