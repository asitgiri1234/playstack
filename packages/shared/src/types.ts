/**
 * Domain enums and field lists.
 *
 * These are declared here rather than imported from `@prisma/client` on
 * purpose: the web app must be able to import roles and field names without
 * pulling the Prisma runtime (and a DATABASE_URL) into a browser bundle.
 * `apps/api` asserts at build time that these stay in sync with schema.prisma.
 */

export const ROLES = ['SUPER_ADMIN', 'HR_MANAGER', 'EMPLOYEE'] as const;
export type Role = (typeof ROLES)[number];

export const STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type Status = (typeof STATUSES)[number];

export const DEPARTMENTS = ['Engineering', 'Sales', 'Marketing', 'HR', 'Finance'] as const;
export type Department = (typeof DEPARTMENTS)[number];

/**
 * Every Employee column a human may ever write through the API.
 *
 * Deliberately excludes:
 *  - id, employeeCode  — identity, assigned once at creation, never edited
 *  - passwordHash      — only ever set via the password-change flow, which
 *                        hashes server-side; never a plain field write
 *  - deletedAt         — soft delete is gated by EMPLOYEE:DELETE, not by a
 *                        field write, so nobody can "update" their way out of
 *                        a deletion check
 *  - createdAt/updatedAt — database-managed
 *
 * This is the universe that WRITABLE_FIELDS draws from. A new schema column is
 * invisible to the write layer until it is added here AND to a role's list.
 */
export const MUTABLE_EMPLOYEE_FIELDS = [
  'name',
  'email',
  'phone',
  'department',
  'designation',
  'salary',
  'joiningDate',
  'status',
  'role',
  'managerId',
  'profileImage',
] as const;

export type MutableEmployeeField = (typeof MUTABLE_EMPLOYEE_FIELDS)[number];

/** Shape the API hangs off a verified access token. */
export interface AuthenticatedActor {
  id: string;
  employeeCode: string;
  role: Role;
}

/** JWT access-token claims. `sub` is the Employee id (uuid), not employeeCode. */
export interface AccessTokenClaims {
  sub: string;
  role: Role;
  iat: number;
  exp: number;
}
