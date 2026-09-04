# API reference

Generated from `backend/src/routes/`. **72 endpoints across 8 route modules.**

Guards are listed in the order the middleware actually runs. `perm:` is a per-club permission
checked by `requireClubPermission`, which also resolves `:slug` and the caller's club context
onto the request before the handler sees it.

Every response uses the same envelope:

```jsonc
// success
{ "success": true, "message": "Clubs", "data": { "items": [...], "pagination": {...} } }
// failure
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "details": {...} } }
```

The client unwraps `data` in an axios interceptor, so call sites receive the payload directly.


## Auth

| Method | Path | Guards |
| --- | --- | --- |
| `POST` | `/api/auth/register` | **public** · validated body |
| `POST` | `/api/auth/login` | **public** · validated body |
| `POST` | `/api/auth/refresh` | **public** |
| `POST` | `/api/auth/logout` | authenticated |
| `GET` | `/api/auth/me` | authenticated |
| `GET` | `/api/auth/verify-email` | **public** |
| `POST` | `/api/auth/resend-verification` | **public** · validated body |

## Account security

Mounted at the root rather than under one prefix, because its paths span both
`/auth` (the public reset flow) and `/profile/me` (authenticated account management).

| Method | Path | Guards |
| --- | --- | --- |
| `POST` | `/api/profile/me/change-password` | authenticated · validated body |
| `POST` | `/api/auth/forgot-password` | **public** · validated body |
| `GET` | `/api/auth/reset-password/validate` | **public** |
| `POST` | `/api/auth/reset-password` | **public** · validated body |
| `GET` | `/api/profile/me/sessions` | authenticated |
| `DELETE` | `/api/profile/me/sessions/:id` | authenticated |
| `POST` | `/api/profile/me/sessions/revoke-others` | authenticated |
| `DELETE` | `/api/profile/me` | authenticated |

## Profile

| Method | Path | Guards |
| --- | --- | --- |
| `GET` | `/api/profile/me` | authenticated |
| `PATCH` | `/api/profile/me` | authenticated · validated body |
| `GET` | `/api/profile/me/stats` | authenticated |
| `GET` | `/api/profile/me/clubs` | authenticated · validated query |
| `GET` | `/api/profile/me/skills` | authenticated · role: student |
| `PUT` | `/api/profile/me/skills` | authenticated · role: student · validated body |
| `GET` | `/api/profile/:handle` | authenticated |
| `GET` | `/api/profile/:handle/events` | authenticated · validated query |

## Clubs

| Method | Path | Guards |
| --- | --- | --- |
| `GET` | `/api/clubs` | authenticated · role: student · validated query |
| `POST` | `/api/clubs` | authenticated · role: faculty,super_admin · validated body |
| `PATCH` | `/api/clubs/:slug/verification` | authenticated · role: super_admin · validated body |
| `PATCH` | `/api/clubs/:slug/status` | authenticated · role: super_admin · validated body |
| `GET` | `/api/clubs/:slug` | authenticated · validated query |
| `PATCH` | `/api/clubs/:slug` | authenticated · perm: `club:edit` · validated body |
| `DELETE` | `/api/clubs/:slug` | authenticated · role: super_admin |
| `POST` | `/api/clubs/:slug/join` | authenticated |
| `DELETE` | `/api/clubs/:slug/membership` | authenticated |
| `POST` | `/api/clubs/:slug/follow` | authenticated |
| `DELETE` | `/api/clubs/:slug/follow` | authenticated |
| `POST` | `/api/clubs/:slug/coordinators` | authenticated · role: super_admin · validated body |
| `DELETE` | `/api/clubs/:slug/coordinators/:userId` | authenticated · role: super_admin |
| `GET` | `/api/clubs/:slug/members/stats` | authenticated · perm: `members:moderate` |
| `GET` | `/api/clubs/:slug/members/search` | authenticated · perm: `members:moderate` · validated query |
| `GET` | `/api/clubs/:slug/members` | authenticated · validated query |
| `POST` | `/api/clubs/:slug/members` | authenticated · perm: `members:moderate` · validated body |
| `PATCH` | `/api/clubs/:slug/members/:userId/status` | authenticated · perm: `members:moderate` · validated body |
| `PATCH` | `/api/clubs/:slug/members/:userId/role` | authenticated · perm: `members:assign-role` · validated body |
| `DELETE` | `/api/clubs/:slug/members/:userId` | authenticated · perm: `members:moderate` |
| `GET` | `/api/clubs/:slug/roles` | authenticated |
| `POST` | `/api/clubs/:slug/roles` | authenticated · perm: `roles:manage` · validated body |
| `PATCH` | `/api/clubs/:slug/roles/:roleSlug` | authenticated · perm: `roles:manage` · validated body |
| `DELETE` | `/api/clubs/:slug/roles/:roleSlug` | authenticated · perm: `roles:manage` |
| `GET` | `/api/clubs/:slug/announcements` | authenticated · validated query |
| `POST` | `/api/clubs/:slug/announcements` | authenticated · perm: `announcements:create` · validated body |
| `PATCH` | `/api/clubs/:slug/announcements/:id/pin` | authenticated · perm: `announcements:pin` · validated body |
| `DELETE` | `/api/clubs/:slug/announcements/:id` | authenticated |
| `GET` | `/api/clubs/:slug/events` | authenticated · validated query |
| `POST` | `/api/clubs/:slug/events` | authenticated · perm: `events:create` · validated body |
| `PATCH` | `/api/clubs/:slug/events/:eventId` | authenticated · perm: `events:edit` · validated body |
| `PATCH` | `/api/clubs/:slug/events/:eventId/status` | authenticated · perm: `events:publish` / `events:cancel` · validated body |
| `DELETE` | `/api/clubs/:slug/events/:eventId` | authenticated · perm: `events:cancel` |
| `GET` | `/api/clubs/:slug/events/:eventId/attendees` | authenticated · perm: `events:edit` · validated query |

## Events

| Method | Path | Guards |
| --- | --- | --- |
| `GET` | `/api/events` | authenticated · validated query |
| `GET` | `/api/events/me` | authenticated · validated query |
| `GET` | `/api/events/:eventId` | authenticated |
| `GET` | `/api/events/:eventId/announcements` | authenticated |
| `POST` | `/api/events/:eventId/register` | authenticated |
| `DELETE` | `/api/events/:eventId/register` | authenticated |

## Announcements

| Method | Path | Guards |
| --- | --- | --- |
| `GET` | `/api/announcements` | authenticated · role: student · validated query |

## Admin (super admin only)

| Method | Path | Guards |
| --- | --- | --- |
| `GET` | `/api/admin/users` | **public** · validated query |
| `GET` | `/api/admin/faculty/stats` | **public** |
| `GET` | `/api/admin/students/stats` | **public** |
| `POST` | `/api/admin/users` | **public** · validated body |
| `PATCH` | `/api/admin/users/:id/active` | **public** · validated body |
| `GET` | `/api/admin/clubs` | **public** · validated query |
| `GET` | `/api/admin/events` | **public** · validated query |

## Permissions

| Method | Path | Guards |
| --- | --- | --- |
| `GET` | `/api/permissions/catalog` | authenticated |

