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

/**
 * Every Employee column that may EVER leave the API, for anyone.
 *
 * The read-side mirror of MUTABLE_EMPLOYEE_FIELDS, and a whitelist for the same
 * reason: a column added to schema.prisma is invisible until it is listed here
 * AND cleared by canReadField. `passwordHash` is absent and must stay absent —
 * that omission is what stops a `select: *` refactor from serialising hashes to
 * the browser.
 */
export const READABLE_EMPLOYEE_FIELDS = [
  'id',
  'employeeCode',
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
  'deletedAt',
  'createdAt',
  'updatedAt',
] as const;

export type ReadableEmployeeField = (typeof READABLE_EMPLOYEE_FIELDS)[number];

/**
 * What serializeEmployee actually emits — the contract between the API and the
 * UI, defined once so neither side guesses.
 *
 * `salary` and `deletedAt` are OPTIONAL because the serializer omits fields the
 * actor may not read (see canReadField). That optionality is the type system
 * carrying a permission rule: a component that renders `employee.salary` has to
 * handle it being absent, so "EMPLOYEE views the roster" cannot crash and
 * cannot silently render `undefined`. They are omitted, never null — null would
 * mean "no salary set", which is a different fact.
 */
export interface EmployeeDTO {
  id: string;
  employeeCode: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  designation: string;
  /** Decimal string, not a number — see schema.prisma on money in floats. */
  salary?: string;
  joiningDate: string;
  status: Status;
  role: Role;
  managerId: string | null;
  profileImage: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * A node in GET /api/organization/tree.
 *
 * An EmployeeDTO (so salary is already stripped per-actor by the server) plus
 * its subtree and the two counts the API computes server-side. `reports` is the
 * recursion; the UI renders straight from this one payload, never fetching
 * per node.
 */
export interface OrgTreeNode extends EmployeeDTO {
  reports: OrgTreeNode[];
  directReportCount: number;
  totalDescendantCount: number;
}

/** Envelope of GET /api/organization/tree. */
export interface OrgTreeResponse {
  data: OrgTreeNode[];
  /** How many nodes had a missing/deleted manager and were surfaced as roots. */
  orphanCount: number;
}

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
