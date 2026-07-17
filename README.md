# Playstack — Employee Management System

Monorepo: Express + TypeScript API, Next.js web app, and a shared package that
holds the **single** definition of the permission matrix, domain types, and Zod
schemas used by both.

> **Status: Phase 0** — scaffolding, database schema, and permission model only.
> No route handlers, controllers, or React components yet.

## Layout

```
playstack/
├── apps/
│   ├── api/              Express + TS backend
│   │   ├── prisma/
│   │   │   ├── schema.prisma    Employee + RefreshToken models
│   │   │   ├── migrations/      generated
│   │   │   └── seed.ts          23-person org tree
│   │   └── src/env.ts           zod-validated environment
│   └── web/              Next.js frontend (config only this phase)
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

## Phase 0 exit criteria

- [x] Prisma schema + initial migration applied
- [x] Permission matrix + field whitelist, single definition, imported by both apps
- [x] Zod schemas shared by forms and middleware
- [x] Seed: 23-person tree, 3+ levels, ICs under ICs, INACTIVE + soft-deleted rows
- [x] docker-compose, `.env.example`, strict tsconfig, ESLint + Prettier
