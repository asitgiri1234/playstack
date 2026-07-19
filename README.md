# Playstack — Employee Management System

Monorepo: Express + TypeScript API, Next.js web app, and a shared package that
holds the **single** definition of the permission matrix, domain types, and Zod
schemas used by both.

> **Status: Phase 5** — dashboard with charts, organizational tree view, and
> dark mode. Consumes Phase 2's `/stats` and Phase 3's `/organization/tree`.
> Dark mode is a pure CSS-variable token swap; charts read the same tokens.

## Layout

```
playstack/
├── apps/
│   ├── api/              Express + TS backend
│   │   ├── prisma/
│   │   │   ├── schema.prisma    Employee + RefreshToken models
│   │   │   ├── migrations/      generated
│   │   │   └── seed.ts          23-person org tree
│   │   └── src/
│   │       ├── env.ts           zod-validated environment
│   │       ├── app.ts           express assembly
│   │       ├── lib/             errors, prisma, cookie transport
│   │       ├── middleware/      authenticate → authorize → sanitizeFields → errorHandler
│   │       ├── routes/          auth.routes.ts (the only routes in Phase 1)
│   │       ├── services/        auth.service.ts, guards.ts
│   │       └── __tests__/       vitest + supertest — the RBAC evidence
│   └── web/              Next.js App Router frontend
│       └── src/
│           ├── app/            (auth)/login, (dashboard)/{employees,profile}
│           ├── components/     ui/, layout/, employees/, auth/, profile/
│           ├── hooks/          use-employee-filters, use-employees, use-directory
│           ├── lib/            api.ts, auth-context.tsx, providers, format
│           └── middleware.ts   route-level redirect (UX only — API is the gate)
├── packages/
│   └── shared/           @playstack/shared — imported by BOTH apps
│       └── src/
│           ├── types.ts        Role, Status, MUTABLE_EMPLOYEE_FIELDS
│           ├── permissions.ts  Permission, ROLE_PERMISSIONS, can(), WRITABLE_FIELDS
│           └── validation.ts   Zod schemas
├── docker-compose.yml    Postgres 16 (healthcheck) + pgAdmin
└── .env.example
```

## Getting started

```bash
npm install
cp .env.example .env          # then replace EVERY CHANGE_ME value — see below
npm run build:shared          # apps import @playstack/shared from dist
npm run db:up                 # Postgres 16 + pgAdmin
npm run db:migrate            # prisma migrate dev
npm run db:seed               # org tree + demo credentials table
```

`.env.example` is a committed template and holds no real values. Fill in each
`CHANGE_ME` before the first `db:up` — compose has no fallback defaults and will
refuse to start rather than quietly use a placeholder credential:

```bash
openssl rand -base64 48   # once for JWT_SECRET, again for JWT_REFRESH_SECRET
```

Set `POSTGRES_PASSWORD` to any local value, and make sure the password, user and
port inside `DATABASE_URL` match the `POSTGRES_*` vars — they are not derived.

Postgres is exposed on `POSTGRES_PORT` (default `5432`). If that port is already
taken locally, change `POSTGRES_PORT` **and** the port inside `DATABASE_URL` in
`.env` — compose reads both from there.

pgAdmin: <http://localhost:5050> (credentials in `.env`).

### Scripts

| Command              | What it does                                  |
| -------------------- | --------------------------------------------- |
| `npm run db:up`      | Start Postgres + pgAdmin                      |
| `npm run db:down`    | Stop them                                     |
| `npm run db:migrate` | Create + apply a migration, regenerate client |
| `npm run db:seed`    | Wipe and reseed the demo org                  |
| `npm run db:reset`   | Drop, re-migrate, reseed                      |
| `npm run db:studio`  | Prisma Studio                                 |
| `npm run typecheck`  | Typecheck every workspace                     |
| `npm run lint`       | ESLint across the monorepo                    |
| `npm run format`     | Prettier write                                |

## Permission matrix

Defined once in [`packages/shared/src/permissions.ts`](packages/shared/src/permissions.ts).
The API enforces it; the UI reads it to decide what to render. Only the first is security.

| Permission             | SUPER_ADMIN | HR_MANAGER | EMPLOYEE |
| ---------------------- | :---------: | :--------: | :------: |
| `EMPLOYEE:CREATE`      |     ✅      |     ✅     |    ❌    |
| `EMPLOYEE:READ_ALL`    |     ✅      |     ✅     |    ❌    |
| `EMPLOYEE:READ_SELF`   |     ✅      |     ✅     |    ✅    |
| `EMPLOYEE:UPDATE_ANY`  |     ✅      |     ✅     |    ❌    |
| `EMPLOYEE:UPDATE_SELF` |     ✅      |     ✅     |    ✅    |
| `EMPLOYEE:DELETE`      |     ✅      |     ❌     |    ❌    |
| `ROLE:ASSIGN_ADMIN`    |     ✅      |     ❌     |    ❌    |
| `MANAGER:ASSIGN`       |     ✅      |     ❌     |    ❌    |
| `ORG:READ_TREE`        |     ✅      |     ✅     |    ✅    |
| `DASHBOARD:READ`       |     ✅      |     ✅     |    ❌    |

### Field-level writes

`WRITABLE_FIELDS` is a **whitelist**. A column added to `schema.prisma` is
unwritable by every role until it is added to `MUTABLE_EMPLOYEE_FIELDS` *and* to
a role's list. Forgetting yields "HR can't edit the new field" — a bug report,
not an incident.

- **SUPER_ADMIN** — every mutable field.
- **HR_MANAGER** — every mutable field, except:
  - no writes at all to a target whose current role is `SUPER_ADMIN`;
  - may not set `role` to `SUPER_ADMIN` (needs `ROLE:ASSIGN_ADMIN`).
- **EMPLOYEE** — only `phone` and `profileImage`, only on their own record.

Three helpers, in increasing order of completeness:

- `can(role, permission)` — the verb only.
- `canWriteField(actorRole, targetRole, field)` — verb + the HR/Super-Admin rule.
- `canApplyEmployeeUpdate(ctx, patch)` — **prefer this at call sites.** Checks
  verb, self-scope, field whitelist, and the incoming `role` value together, and
  returns the accepted field list so the Prisma `data` object is built from the
  matrix rather than from the request body. Rejects the whole patch if any field
  is disallowed — a partial apply would tell the client a write landed when it didn't.

## Design decisions worth knowing

- **`salary` is `Decimal(12,2)`, never `Float`.** Binary floating point can't
  represent `0.1`; payroll stops reconciling. Money crosses the wire as a string.
- **Soft delete.** `deletedAt IS NULL` = live. Every read filters on it, so it is
  indexed, including in a composite with `department` and `status`.
- **`employeeCode` is separate from `id`.** The uuid is internal and stable; the
  code is human-facing and must be reformattable without breaking foreign keys.
- **`onDelete: SetNull` on `managerId`.** Deleting a manager orphans their reports
  for reassignment; it must never cascade-delete the reports.
- **`RefreshToken` is stored server-side.** A stateless JWT can't be revoked, so
  "log out everywhere" needs a database row. Only the SHA-256 hash is stored.
- **Two different JWT secrets.** A leaked access secret must not mint refresh tokens.
- **Permission grants are explicit, not inherited.** No "SUPER_ADMIN implies
  everything" shortcut — that makes carving out an exception later impossible
  without rewriting the evaluator.

## The middleware chain

Order is load-bearing. Each link answers exactly one question, and each assumes
the previous one already ran:

| # | Middleware        | Question it answers                                    |
| - | ----------------- | ------------------------------------------------------ |
| 1 | `authenticate`    | Who are you? Verifies the JWT, then re-reads the employee (and their role) from the database. 401. |
| 2 | `authorize(perm)` | May your **role** do this **verb**? One `can()` call against the shared matrix. 403. |
| 3 | `sanitizeFields`  | Which **fields** may you write on **this target**? Loads the target, checks each body key. 403 by default. |
| 4 | *guards*          | Do the **business rules** allow it? Self-scope, last-admin, self-role-change. Pure functions in `services/guards.ts`. |
| 5 | `errorHandler`    | Turns thrown `AppError`s into responses. Last, always. |

`authenticate` deliberately ignores `role` in the JWT payload and re-reads it
per request. A JWT is a signed snapshot: demote someone at 10:00 and their
09:58 token still validly claims `SUPER_ADMIN` until it expires. One indexed
primary-key lookup buys immediate revocation.

## GET /api/employees — query parameters

All filters compose (AND across parameters, OR within a repeatable one). Every
query filters `deletedAt: null` unless `includeDeleted` applies.

| Param            | Type / values                                  | Default | Notes |
| ---------------- | ---------------------------------------------- | ------- | ----- |
| `search`         | string                                         | —       | Partial, case-insensitive, matches **name OR email** |
| `department`     | string, **repeatable**                         | —       | Exact. `?department=Sales&department=Engineering` = OR |
| `role`           | `SUPER_ADMIN` \| `HR_MANAGER` \| `EMPLOYEE`, **repeatable** | — | Exact |
| `status`         | `ACTIVE` \| `INACTIVE`                         | —       | Exact |
| `managerId`      | uuid                                           | —       | Direct reports of that manager |
| `sortBy`         | `name` \| `joiningDate` \| `salary` \| `department` | `name` | Whitelist. Anything else → **400**, never 500 |
| `sortOrder`      | `asc` \| `desc`                                | `asc`   | |
| `page`           | int ≥ 1                                        | `1`     | |
| `limit`          | int ≥ 1                                        | `20`    | **Clamped to 100.** Uncapped is free DoS |
| `includeDeleted` | flag                                           | `false` | Honoured only for actors with `EMPLOYEE:DELETE`; **ignored** (not rejected) otherwise |

Unknown query params are rejected with a 400 rather than ignored.

Response envelope:

```json
{
  "data": [ /* serialized employees */ ],
  "pagination": { "page": 1, "limit": 20, "total": 21, "totalPages": 2, "hasNext": true, "hasPrev": false }
}
```

## Salary visibility

The read-side mirror of `WRITABLE_FIELDS`, defined in the same matrix
(`canReadField`) so the UI and the API cannot disagree:

- **SUPER_ADMIN / HR_MANAGER** — all salaries (they hold `EMPLOYEE:READ_ALL`)
- **EMPLOYEE** — their own salary only
- **`deletedAt`** — only actors holding `EMPLOYEE:DELETE`
- **`passwordHash`** — nobody, ever; it is absent from the whitelist

Enforced by `serializeEmployee(employee, actor)`. Every response goes through
it; nothing hands a raw Prisma object to `res.json()`. Fields are **omitted**
rather than nulled — `salary: null` is indistinguishable from "not set".

## Organizational hierarchy

| Endpoint | Permission | Notes |
| -------- | ---------- | ----- |
| `GET /api/organization/tree` | `ORG:READ_TREE` (all roles) | `?rootId` subtree, `?depth=N` cap. Multiple roots supported |
| `GET /api/employees/:id/reportees` | scope-checked | `?direct=true` (default) or `?direct=false` for the full subtree |
| `PATCH /api/employees/:id/manager` | `MANAGER:ASSIGN` (SUPER_ADMIN) | Body `{ managerId: string \| null }` |

The chart is not a secret — every role may read it. What differs is each node's
*content*: `serializeEmployee` runs per node, so an EMPLOYEE sees all 21 names
and titles and exactly one salary, their own.

**Cycle prevention** (`hierarchy.service.ts`) rejects self-assignment, any
descendant as manager (at any depth), and missing/soft-deleted managers.

- **Recursive CTE, not a parent walk.** Walking *up* from the new manager is
  O(depth) round trips and loops forever if the data already contains a cycle.
  One depth-capped CTE descending from a known root cannot hang.
- **Raw SQL is a considered exception.** Prisma's builder cannot express
  recursion. It is confined to this one file, every value is bound via
  `Prisma.sql`, and results are typed explicitly (`$queryRaw` returns `unknown`).
  No `::uuid` casts: Prisma maps `String @id` to a **text** column.
- **Depth capped at 100** regardless of approach, so pre-existing bad data
  degrades into a truncated result instead of a hung query.
- **Writes re-check inside a Serializable transaction.** A pre-check plus a
  later write is a TOCTOU window: two reassignments can each be individually
  legal and jointly form a cycle. The isolation level is what closes it.

**Tree building is one query**, not one per node. N+1 here is invisible at 23
employees and fatal at 2,000 — so the test asserts the query count stays *constant*
as the org grows, rather than asserting latency.

**Orphans** (a `managerId` pointing at a missing/deleted row) are logged and
surfaced as roots, never dropped. A slightly wrong tree gets fixed; a silently
missing employee does not.

## Frontend (Phase 4)

Next.js App Router. Server Components for the static shells; `'use client'` only
where interactivity requires it. Design uses CSS-variable tokens (zinc neutral +
an evergreen accent, deliberately not #3B82F6) so Phase 5's dark mode is a token
swap, not a rewrite.

Load-bearing decisions, each commented at its source:

- **In-memory access token.** Held in a module variable, never localStorage —
  localStorage is XSS-readable, and one bad dependency turns that into a stolen
  session. A page refresh re-mints it from the httpOnly refresh cookie via a
  single `/api/auth/refresh` on mount, so refreshing does not log you out.
- **Coordinated refresh.** Parallel requests that 401 wait behind ONE in-flight
  refresh. Firing N refreshes would rotate the token N times, and rotation
  treats the now-revoked older token as reuse — hard-logging-out the user by
  their own dashboard loading.
- **URL is the state.** Every filter/sort/page lives in the query string, so a
  filtered view is shareable and survives refresh. There is no fetch-once-then-
  filter-in-JS; each change hits the API, which also means salary is stripped
  per-actor server-side rather than shipped and hidden.
- **Middleware is UX only.** It reads a forgeable, non-sensitive hint cookie to
  avoid flashing the wrong first screen. The API authenticates every request and
  re-reads the role from the database; the redirect is courtesy, not a gate.

Permission-driven UI throughout, all delegating to `can()` / `canWriteField()` /
`canAssignRole()` from the shared matrix: sidebar links are filtered (not
greyed), row actions gated, and form fields disabled or omitted — a disabled
input and a 403 are the same rule rendered two ways.

## Dashboard, org tree, and dark mode (Phase 5)

**Dark mode is a token swap.** Every colour resolves through a semantic CSS
variable (`--surface`, `--border`, `--text`…); the `.dark` block in `globals.css`
redefines only that semantic layer, and every component follows because none
names a colour directly. next-themes toggles `class="dark"` on `<html>` with a
pre-paint script (no flash of wrong theme) and honours `prefers-color-scheme` on
first visit. The two overlay leaks Phase 4 left (`bg-zinc-950/20`) were replaced
with an `--overlay` token during the audit.

**Charts read the same tokens.** `useChartTheme` reads the chart CSS variables
off the document at runtime and re-reads them on theme change, so recharts gets
concrete colours that recolour with the page — a chart can't be legible in one
theme and unreadable in the other. Each chart carries a visible title **and** an
`sr-only` data table of the same numbers: the SVG is `aria-hidden`, the table is
its accessible equivalent.

- **Dashboard** (`DASHBOARD:READ` — SUPER_ADMIN + HR) consumes `/stats` in one
  request. Four stat cards + a department bar chart + role and status donuts.
  An EMPLOYEE who reaches `/dashboard` is redirected to `/profile`.
- **Org tree** (`ORG:READ_TREE` — everyone) renders from the single
  `/organization/tree` payload — no per-node fetch. Collapsible nodes with
  connector lines, expand/collapse-all, multiple roots, keyboard-operable, and a
  detail drawer. Salary is absent for anyone the server stripped it for.
- **Manager reassignment** from the drawer (SUPER_ADMIN) → `PATCH
  /employees/:id/manager`. Cycle prevention stays server-owned; its 409 surfaces
  as an inline field error, never reimplemented client-side.

## Tests

```bash
npm test     # 160 backend tests
```

Integration tests run against a **separate** `playstack_test` database
(`TEST_DATABASE_URL`) because they truncate tables between tests. Phase 1 ships
no employee routes, so the RBAC suite mounts the real middleware chain onto
throwaway handlers in `src/__tests__/helpers/harness.ts` — a test-only file that
nothing in `src/` imports. Phase 2's controllers should wire the chain in the
same order.

## Phase 5 exit criteria

- [x] Dark mode via next-themes — pure token swap, no flash, system-aware, zero hardcoded hex in components
- [x] Dashboard — one `/stats` request, four stat cards, three responsive recharts with sr-only table fallbacks
- [x] Charts read colours from CSS vars — verified legible in both themes (donut animation disabled so theme toggles recolour cleanly)
- [x] Org tree — single-payload render, collapsible nodes with connectors, expand/collapse-all, multiple roots, pan on overflow
- [x] Node detail drawer — reuses Phase 4 edit form; manager reassignment (SUPER_ADMIN) with server-owned cycle check surfaced inline
- [x] Dashboard gated to SUPER_ADMIN + HR; EMPLOYEE redirected to profile; salary never leaks into the tree
- [x] Verified in a real browser across roles and both themes (24 behaviours); typecheck, lint, web build, and 160 backend tests all pass

## Phase 4 exit criteria

- [x] Typed API client — in-memory token, single-flight refresh queue, typed `ApiError`
- [x] Auth context + `usePermission`, rehydrate-on-mount, UX-only route middleware
- [x] App shell — login, responsive sidebar/topbar, permission-filtered nav, auth guard with skeleton
- [x] Employee table — server-driven filter/sort/pagination, URL-as-state, all three of loading/empty/error built
- [x] Create/edit forms — shared Zod schemas, field-level permission gating, 400/409 mapped onto inputs
- [x] TanStack Query data layer, toasts, invalidate-and-refetch after mutations
- [x] Verified in a real browser across all three roles (34 behaviours); typecheck, lint, and production build all clean

## Phase 3 exit criteria

- [x] `assertNoCycle` — self, descendant-at-any-depth, missing/deleted manager
- [x] Recursive CTEs (`getDescendantIds`, `getAncestorIds`), depth-capped, parameterized
- [x] `GET /api/organization/tree` — one query, in-memory build, multiple roots, orphans surfaced
- [x] `GET /api/employees/:id/reportees` — direct or full subtree, self-scoped
- [x] `PATCH /api/employees/:id/manager` — Serializable re-check, returns moved subtree
- [x] Closed a real hole: `managerId` now requires `MANAGER:ASSIGN`, so `PUT /:id`
      is no longer an unlocked, cycle-free back door to the same change
- [x] 160 tests passing

## Phase 2 exit criteria

- [x] Employee service: list, getById, create, update, softDelete, restore
- [x] Salary visibility via `serializeEmployee` — unit-tested directly, because
      no route currently lets an EMPLOYEE reach another's record, so the
      route-level tests alone would not have caught the rule being deleted
- [x] `GET /api/employees` — search, repeatable filters, whitelisted sort, capped pagination
- [x] `GET /api/employees/stats` — counts + groupings in one transaction, aggregated in Postgres
- [x] Soft delete re-parents reports to the grandparent, in a transaction
- [x] 128 tests passing

## Phase 1 exit criteria

- [x] Auth service: login, refresh with rotation + reuse detection, logout
- [x] Middleware chain: authenticate, authorize, sanitizeFields, errorHandler
- [x] Token transport: access in body, refresh in httpOnly/SameSite=Strict cookie
- [x] Guards: five pure functions, unit-tested without a database
- [x] `/api/auth/*` routes, login rate-limited 5/15min per IP+email
- [x] 71 tests passing

## Phase 0 exit criteria

- [x] Prisma schema + initial migration applied
- [x] Permission matrix + field whitelist, single definition, imported by both apps
- [x] Zod schemas shared by forms and middleware
- [x] Seed: 23-person tree, 3+ levels, ICs under ICs, INACTIVE + soft-deleted rows
- [x] docker-compose, `.env.example`, strict tsconfig, ESLint + Prettier
