# Playstack API Reference

Base URL (local): `http://localhost:4000`

All routes are under `/api`. A liveness probe is at `GET /health` → `{ "status": "ok" }`.

> This document is hand-cross-checked against the route files
> (`apps/api/src/routes/*.routes.ts`). Schemas are defined once in Zod
> (`packages/shared/src/validation.ts`) and shared verbatim with the frontend —
> the request shapes below are those schemas described in prose.

---

## Conventions

### Authentication

| Token | Transport | Lifetime | Notes |
| --- | --- | --- | --- |
| Access token (JWT) | `Authorization: Bearer <token>` header | 15 min | Payload is `{ sub, role }` only. The API **re-reads the role from the database on every request** — the claim is never trusted for authorization. |
| Refresh token | `playstack_refresh` httpOnly cookie, path `/api/auth`, `SameSite=Strict`, `Secure` in production | 7 days | Opaque random value; only its SHA-256 hash is stored. Rotated on every refresh; reuse of a rotated token revokes the whole session family. |

Send `credentials: 'include'` from browsers so the refresh cookie rides on
`/api/auth/*` requests.

### Error envelope

Every error has one shape:

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You may not write the following field(s): salary.",
    "details": { "rejectedFields": ["salary"] }
  }
}
```

`details` is optional and machine-readable (validation field errors, rejected
field lists). Stack traces and database errors never reach the client.

### Standard status codes

| Code | Meaning here |
| --- | --- |
| `400` | Validation failed. `error.code = "VALIDATION_ERROR"`, `details` maps field → messages. Unknown body/query keys are rejected, not ignored. |
| `401` | Missing/invalid/expired token, or the account is deleted/inactive. Also every login failure (one generic message — see below). |
| `403` | Authenticated, but the role lacks the permission, the field write is not allowed, or a self-scoped route was asked about someone else (IDOR guard). |
| `404` | Resource does not exist or is soft-deleted. |
| `409` | Conflict: duplicate email, reporting cycle, restoring a live record, or an operation that would remove the last Super Admin. |
| `429` | Login rate limit: 5 failed attempts / 15 min per IP+email. |

### Roles and permissions

Permissions come from the shared matrix (`packages/shared/src/permissions.ts`):

| Permission | SUPER_ADMIN | HR_MANAGER | EMPLOYEE |
| --- | :-: | :-: | :-: |
| `EMPLOYEE:CREATE` | ✅ | ✅ | — |
| `EMPLOYEE:READ_ALL` | ✅ | ✅ | — |
| `EMPLOYEE:READ_SELF` | ✅ | ✅ | ✅ |
| `EMPLOYEE:UPDATE_ANY` | ✅ | ✅ | — |
| `EMPLOYEE:UPDATE_SELF` | ✅ | ✅ | ✅ |
| `EMPLOYEE:DELETE` | ✅ | — | — |
| `ROLE:ASSIGN_ADMIN` | ✅ | — | — |
| `MANAGER:ASSIGN` | ✅ | — | — |
| `ORG:READ_TREE` | ✅ | ✅ | ✅ |
| `DASHBOARD:READ` | ✅ | ✅ | — |

Two rules ride on top of the matrix: **HR cannot write anything on a
SUPER_ADMIN record**, and **`salary` in responses is omitted** unless the actor
holds `EMPLOYEE:READ_ALL` or is reading their own record (`deletedAt` requires
`EMPLOYEE:DELETE`).

### Employee object (serialized)

```json
{
  "id": "5d400220-e488-4df6-84b9-e9ccf1164521",
  "employeeCode": "EMP-0001",
  "name": "Aarav Mehta",
  "email": "aarav.mehta@playstack.dev",
  "phone": "+919810000001",
  "department": "Engineering",
  "designation": "Chief Executive Officer",
  "salary": "9500000",
  "joiningDate": "2018-01-15T00:00:00.000Z",
  "status": "ACTIVE",
  "role": "SUPER_ADMIN",
  "managerId": null,
  "profileImage": null,
  "deletedAt": null,
  "createdAt": "2026-07-17T05:45:29.000Z",
  "updatedAt": "2026-07-17T05:45:29.000Z"
}
```

`salary` is a **decimal string** (money is never a float). `salary` and
`deletedAt` are *omitted* (not null) when the actor may not read them.

---

## Auth

### POST `/api/auth/login`

Rate limited: 5 failed attempts / 15 min per IP+email. No auth required.

Body:

```json
{ "email": "aarav.mehta@playstack.dev", "password": "SuperAdmin@123" }
```

`200` — sets the refresh cookie and returns:

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs…",
  "user": {
    "id": "…", "employeeCode": "EMP-0001", "name": "Aarav Mehta",
    "email": "aarav.mehta@playstack.dev", "role": "SUPER_ADMIN"
  },
  "permissions": ["EMPLOYEE:CREATE", "EMPLOYEE:READ_ALL", "…"]
}
```

Errors: `400` malformed email/empty password · `401` `INVALID_CREDENTIALS` —
**one identical message** for wrong password, unknown email, soft-deleted and
inactive accounts (no account enumeration; an unknown email still burns a dummy
bcrypt compare so timing doesn't leak either) · `429` rate limited.

### POST `/api/auth/refresh`

No body — the refresh token arrives via the httpOnly cookie. Rotates it: the
presented token is revoked, a new one is set.

`200`:

```json
{ "accessToken": "eyJhbGciOiJIUzI1NiIs…" }
```

Errors (all `401`, cookie cleared): `NO_REFRESH_TOKEN` · `INVALID_REFRESH_TOKEN`
· `REFRESH_TOKEN_EXPIRED` · `ACCOUNT_INACTIVE` (deleted/deactivated after
login) · `TOKEN_REUSE_DETECTED` — a rotated token was replayed, which means two
parties hold it; **every session for that account is revoked**.

### POST `/api/auth/logout`

Revokes the refresh token server-side (the reason the token table exists) and
clears the cookie. Idempotent: always `204`, even for a bogus token.

### GET `/api/auth/me`

Auth: any valid access token. Re-reads the account from the database — this is
what the UI trusts after a page refresh.

`200`:

```json
{
  "user": {
    "id": "…", "employeeCode": "EMP-0006", "name": "Ananya Bose",
    "email": "ananya.bose@playstack.dev", "department": "Engineering",
    "designation": "Staff Software Engineer", "role": "EMPLOYEE",
    "status": "ACTIVE", "profileImage": null
  },
  "permissions": ["EMPLOYEE:READ_SELF", "EMPLOYEE:UPDATE_SELF", "ORG:READ_TREE"]
}
```

Errors: `401` missing/expired token, or account deleted/inactive.

---

## Employees

### GET `/api/employees`

Permission: `EMPLOYEE:READ_ALL` (SUPER_ADMIN, HR_MANAGER).

Query parameters (unknown keys → `400`):

| Param | Type | Default | Notes |
| --- | --- | --- | --- |
| `search` | string | — | Case-insensitive partial match on **name OR email** |
| `department` | string, repeatable | — | `?department=Sales&department=Engineering` ORs within the filter |
| `role` | enum, repeatable | — | `SUPER_ADMIN` \| `HR_MANAGER` \| `EMPLOYEE` |
| `status` | enum | — | `ACTIVE` \| `INACTIVE` |
| `managerId` | uuid | — | Direct reports of that manager |
| `sortBy` | enum | `name` | `name` \| `joiningDate` \| `salary` \| `department` — a whitelist; anything else is `400`, never interpolated |
| `sortOrder` | enum | `asc` | `asc` \| `desc` |
| `page` | int ≥ 1 | `1` | |
| `limit` | int ≥ 1 | `20` | **Clamped to 100** (DoS cap) |
| `includeDeleted` | flag | `false` | Honoured only for holders of `EMPLOYEE:DELETE`; silently ignored otherwise |

Example: `GET /api/employees?department=Engineering&status=ACTIVE&sortBy=salary&sortOrder=desc&page=1&limit=20`

`200`:

```json
{
  "data": [ { "…": "employee objects, salary stripped per-actor" } ],
  "pagination": { "page": 1, "limit": 20, "total": 21, "totalPages": 2, "hasNext": true, "hasPrev": false }
}
```

Errors: `400` bad query param (names the field) · `401` · `403` for EMPLOYEE.

### GET `/api/employees/stats`

Permission: `DASHBOARD:READ` (SUPER_ADMIN, HR_MANAGER). Registered before
`/:id` so `stats` never binds as an id.

`200` — aggregated in Postgres in one transaction (live employees only):

```json
{
  "totalEmployees": 21,
  "activeEmployees": 18,
  "inactiveEmployees": 3,
  "departmentCount": 5,
  "byDepartment": [ { "department": "Engineering", "count": 7 }, { "…": "…" } ],
  "byRole": [ { "role": "EMPLOYEE", "count": 18 }, { "…": "…" } ]
}
```

### GET `/api/employees/:id`

Permission: none at the router — scope decides. `EMPLOYEE:READ_ALL` holders may
read anyone; everyone else only themselves. The self-scope check runs **before**
the existence lookup, so a 403-vs-404 difference can't be used to probe which
uuids are real.

`200`: `{ "data": { …employee } }`
Errors: `403` not your record · `404` missing or soft-deleted (privileged actors only reach this).

### POST `/api/employees`

Permission: `EMPLOYEE:CREATE`. Creating a `SUPER_ADMIN` additionally requires
`ROLE:ASSIGN_ADMIN` → HR gets `403` for that role value.

Body (`createEmployeeSchema`, unknown keys → `400`):

```json
{
  "name": "New Hire",
  "email": "new.hire@playstack.dev",
  "phone": "+919810000456",
  "password": "optional — omitted ⇒ server generates a temp password",
  "department": "Engineering",
  "designation": "Engineer",
  "salary": "1200000.00",
  "joiningDate": "2023-04-01",
  "status": "ACTIVE",
  "role": "EMPLOYEE",
  "managerId": null,
  "profileImage": null
}
```

Rules: valid email · E.164-ish phone · salary > 0, ≤ 2 decimals · joiningDate
not in the future · manager must exist and be live.

`201`:

```json
{
  "data": { "…": "created employee, employeeCode auto-assigned (EMP-0024)" },
  "temporaryPassword": "vN3xw1Qk9ZbT"
}
```

`temporaryPassword` is present **only** when the server generated it, returned
once, never retrievable again.

Errors: `400` validation · `403` role not assignable · `404` manager not found ·
`409` duplicate email.

### PUT `/api/employees/:id`

Permission: `EMPLOYEE:UPDATE_ANY`, then **field-level whitelist**
(`sanitizeFields`): every body key is checked against what this actor may write
on this target. Disallowed keys → `403` naming them (never silently stripped).
HR gets `403` on *any* write to a SUPER_ADMIN record.

Body (`updateEmployeeSchema`): any subset of the create fields except
`password`; at least one field. `managerId` additionally requires
`MANAGER:ASSIGN` and passes the same cycle check as the dedicated endpoint.

Guards on top: nobody edits their own `role` (`403`) · demoting/deactivating
the last live SUPER_ADMIN → `409` · duplicate email → `409`.

`200`: `{ "data": { …updated employee } }`

### PATCH `/api/employees/me`

Permission: `EMPLOYEE:UPDATE_SELF` (all roles). Self-scoped by construction —
there is no `:id` to point at anyone else.

Body (`selfUpdateEmployeeSchema`): **only** `phone` and/or `profileImage`.
Anything else — `salary`, `role`, an unknown key — is `403` with
`details.rejectedFields`.

`200`: `{ "data": { …updated employee } }`

### DELETE `/api/employees/:id`

Permission: `EMPLOYEE:DELETE` (SUPER_ADMIN only). **Soft delete**: sets
`deletedAt`; the row is kept as audit evidence. In the same transaction, the
deleted employee's direct reports are re-parented to *their* manager, so no
subtree is orphaned.

`200`: `{ "data": { …employee, deletedAt set } }`
Errors: `404` already deleted/missing · `409` last live SUPER_ADMIN (lockout guard).

### POST `/api/employees/:id/restore`

Permission: `EMPLOYEE:DELETE`. Clears `deletedAt`. If the old manager was
deleted meanwhile, the restored employee comes back as a root rather than
reporting to a tombstone.

`200`: `{ "data": { …restored employee } }`
Errors: `404` no such employee · `409` not deleted.

### GET `/api/employees/:id/reportees`

Permission: none at the router — same scope rule as `GET /:id` (EMPLOYEE may
only ask about themselves).

Query: `direct` — `true` (default) for immediate reports, `false` for the full
descendant subtree (fetched via one recursive CTE, flattened).

`200`: `{ "data": [ …employees ] }` — an **empty array** for a leaf, not a 404.

### PATCH `/api/employees/:id/manager`

Permission: `MANAGER:ASSIGN` (SUPER_ADMIN only).

Body (`assignManagerSchema`): `{ "managerId": "<uuid>" }` or
`{ "managerId": null }` (detach → becomes a root). The key is required; null is
meaningful.

Cycle prevention: self-assignment, any descendant as manager (checked with a
depth-capped recursive CTE), and missing/soft-deleted managers are refused. The
check is **re-run inside a Serializable transaction**, so two concurrent
reassignments cannot jointly create a cycle (TOCTOU).

`200`:

```json
{
  "data": { "…": "updated employee" },
  "subtree": [ { "…": "the moved employee's tree node, reports nested, for repainting" } ]
}
```

Errors: `403` not SUPER_ADMIN · `404` employee or manager missing ·
`409` `"An employee cannot report to themselves."` / `"…would create a reporting cycle."`

---

## Organization

### GET `/api/organization/tree`

Permission: `ORG:READ_TREE` (**all roles**). Per-node content is still
serialized per-actor — an EMPLOYEE sees the whole structure but nobody else's
salary.

Query: `rootId` (uuid, optional — return only that subtree) · `depth`
(1–100, optional — cap returned levels; counts still describe the full org).

`200` — the entire forest in one response, built server-side from one query:

```json
{
  "data": [
    {
      "…": "employee fields (serialized per-actor)",
      "directReportCount": 6,
      "totalDescendantCount": 20,
      "reports": [ { "…": "child nodes, recursively" } ]
    }
  ],
  "orphanCount": 0
}
```

Multiple roots are legitimate. Nodes whose manager is missing/deleted are
surfaced as roots (and counted in `orphanCount`) rather than dropped.

Errors: `400` bad `depth` · `404` unknown `rootId`.
