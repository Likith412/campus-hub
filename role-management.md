# Role Management

How per-club roles and permissions work in CampusHub — the data model, the permission
catalog, the backend endpoints, the authorization gate, the frontend, and the seeds.

> Scope: this is **per-club** authorization (a member's standing inside one club). It is
> separate from the **platform** role on the `User` (`student` / `faculty` / `superAdmin`).

---

## Concepts

- **ClubRole** — a named role that lives inside one club. Each club is born with two **system
  roles** and can have any number of **custom roles**.
  - `coordinator` (system, weight 100) — implicitly holds **every** permission. Faculty who run
    the club hold this role.
  - `member` (system, weight 0) — the default role; holds no permissions by default.
  - custom roles (weights 1..99) — e.g. "President", "Tech Lead", "Volunteer"; hold an explicit
    subset of the permission catalog.
- **ClubMembership.roleId** — a foreign key from a membership to one ClubRole in that club. This
  is the member's role.
- **roleWeight** — a rank 0..100 on the ClubRole. Doubles as the **hierarchy gate**: you can only
  assign roles ranked below your own. Coordinator = 100, member = 0, custom = 1..99.
- **Permission** — a `"resource:action"` string (e.g. `roles:manage`). A custom role grants only
  the permission keys stored on it; `coordinator` and `superAdmin` short-circuit to all of them.

---

## Permission catalog

Defined in `backend/src/constants/clubPermissions.js` and surfaced to the role editor via
`GET /api/permissions/catalog`.

| Key | Group | Label |
| --- | --- | --- |
| `club:edit` | Club | Edit club profile |
| `members:moderate` | Members | Approve & remove members |
| `members:assign-role` | Members | Assign member roles |
| `roles:manage` | Governance | Manage roles (create/edit/delete custom roles) |
| `announcements:create` | Announcements | Post announcements |
| `announcements:pin` | Announcements | Pin announcements |
| `announcements:delete` | Announcements | Delete announcements |
| `events:create` | Events | Create events |
| `events:edit` | Events | Edit events |
| `events:cancel` | Events | Cancel events |

`CLUB_PERMISSION_KEYS` (the keys array) is the enum used to validate role permissions and the
`ClubRole.permissions` field.

---

## Data model

**`backend/src/models/ClubRole.js`**

| Field | Type | Notes |
| --- | --- | --- |
| `clubId` | ObjectId → Club | required |
| `name` | String | display name |
| `slug` | String | stable per-club id (e.g. `coordinator`); unique within a club |
| `color` | String | badge colour (hex), default `#6c63ff` |
| `permissions` | [String] | subset of `CLUB_PERMISSION_KEYS` |
| `isSystem` | Boolean | system rows (coordinator/member) can't be edited or deleted |
| `roleWeight` | Number | 0..100 rank / hierarchy gate |

Indexes: `{ clubId, slug }` unique; `{ clubId, roleWeight }`.
`systemRoleDocs(clubId)` returns the two system roles every club is seeded with.

**`backend/src/models/ClubMembership.js`** — `roleId` (ObjectId → ClubRole, required) is the
member's role. There is **no** denormalized role string or weight on the membership; rank and
permissions are read from the referenced ClubRole.

---

## Authorization (how a permission is checked)

Two equivalent paths, sharing the same rules:

1. **Route gate** — `requireClubPermission(resource, action)`
   (`backend/src/middlewares/requireClubPermission.js`). Self-contained: resolves the club from
   the route `:slug`, resolves the caller's standing, enforces `` `${resource}:${action}` ``, and
   stashes `req.club` + `req.clubContext`.
2. **In-controller helpers** — `resolveClubContext`, `contextCan`, `assertPermission`
   (`backend/src/controllers/clubs/helpers.js`), used where a handler needs the context for
   response-building (e.g. "what can this viewer do") or an inline gate.

Decision rules (both paths):
- `superAdmin` → allowed (full access).
- the caller's role slug is `coordinator` → allowed (holds everything).
- otherwise → allowed iff the role's `permissions` array includes the key.

`resolveClubContext` returns `{ isSuperAdmin, roleSlug, weight, role, membership }` by loading the
membership and `ClubRole.findById(membership.roleId)`.

---

## Backend endpoints

All under `/api/clubs/:slug` unless noted. Routes: `backend/src/routes/clubs.js`
(ROLES banner) and `backend/src/routes/permissions.js`. Handlers:
`backend/src/controllers/clubs/roles.controller.js` and `members.controller.js`.

### `GET /api/permissions/catalog`
Returns the static permission catalog for the role editor. Auth: any logged-in user.

### `GET /api/clubs/:slug/roles`
Lists system + custom roles with holder counts, plus a `viewer` object
(`isSuperAdmin`, `weight`, `canManageRoles`, `canAssignRole`, `canModerate`, `canEditClub`). Open
to any viewer — it drives the badges, the assign dropdown, and which admin buttons/pages the
frontend shows. Member counts are computed by grouping approved memberships by `roleId`.

### `POST /api/clubs/:slug/roles`
Creates a custom role. Gated by `requireClubPermission("roles", "manage")`.
Body (`createRoleBodySchema`): `name` (2..40), `roleWeight` (int 1..99),
`permissions?` (≤20 catalog keys), `color?` (hex). Slug is derived from the name and
de-duplicated within the club.

### `PATCH /api/clubs/:slug/roles/:roleSlug`
Edits a custom role. Gated by `requireClubPermission("roles", "manage")`.
System roles are immutable (403). Body (`updateRoleBodySchema`): any of
`name` / `roleWeight` / `permissions` / `color`; at least one required.
Changing a role's weight needs no membership sync (rank lives on the ClubRole).

### `DELETE /api/clubs/:slug/roles/:roleSlug`
Deletes a custom role. Gated by `requireClubPermission("roles", "manage")`.
System roles can't be deleted (403). Blocked (409) if any **approved or pending** membership
still holds the role — reassign those members first.

### `PATCH /api/clubs/:slug/members/:userId/role`  (`setMemberRole`)
Assigns a role to an approved member. Requires the `members:assign-role` permission.
Body (`memberRoleBodySchema`): `{ role: "<slug>" }`. Rules enforced:
- target role must exist in the club; member must be `approved`.
- assigning **or** removing the `coordinator` system role is **superAdmin-only**.
- **hierarchy:** a non-superAdmin can only assign a role with `roleWeight` **below** their own.
- **faculty are coordinators only:** a faculty can only be `coordinator`, and can't be dropped to
  a lesser role (remove them from the club instead).

> Coordinators are otherwise assigned/removed via the superAdmin-only coordinator endpoints
> (`POST/DELETE /api/clubs/:slug/coordinators[/:userId]`), which keep the "≥1 coordinator per
> club" invariant.

---

## Frontend

- **`frontend/src/pages/ClubRoles.jsx`** — the role management page: lists roles, create/edit/delete
  custom roles, pick permissions from the catalog, set weight + colour. Gated in the UI by
  `viewer.canManageRoles`.
- **`frontend/src/pages/ManageMembers.jsx`** — the `RolePill` assigns a member's role. The
  assignable options are filtered to roles below the viewer's weight (and exclude `coordinator`),
  matching the backend hierarchy rule.
- **`frontend/src/services/api/clubs.js`** — wrappers: `listRoles`, `createRole`, `updateRole`,
  `deleteRole`, `setMemberRole`. Roles are addressed by **slug** in the URL and `setMemberRole`
  sends the role **slug** in the body — the API contract is slug-based throughout.

The API returns a member's role as its **slug** (e.g. `"president"`), so the frontend badges,
filters, and `roleBySlug` lookups need no knowledge of the underlying `roleId`.

---

## Seeds

- `backend/src/scripts/seedRoles.js` — for every active club: ensures the two system roles, creates
  the custom roles (President w80, Tech Lead w60, Volunteer w30), and assigns a handful of approved
  members into them (by setting `roleId`).
- `backend/src/scripts/seedUsers.js` — ensures system roles exist per club before creating
  memberships, and sets each membership's `roleId` (coordinator / member).

Run order: `db:init` → `db:seed:clubs` → `db:seed:users` → `db:seed:roles` (or `db:seed` /
`db:reset` to run the chain).

---

## Edge cases & notes

- **Dangling `roleId` on past members.** `deleteRole` only blocks when an **approved/pending**
  member holds the role. A member who already **left/removed** while holding a custom role keeps a
  `roleId` pointing at the deleted ClubRole. Reads are null-safe (populate → `role: null`), so a
  historic ("past") row just shows a blank role rather than erroring. Not currently repaired on
  delete.
- **Member-list sorting by role rank** is done with an aggregation `$lookup` to
  `ClubRole.roleWeight` (since the membership no longer stores a weight), so it can't be served
  purely from a membership index.
- **System roles are protected**: `coordinator`/`member` can't be edited or deleted, and assigning
  the `coordinator` role is superAdmin-only.
