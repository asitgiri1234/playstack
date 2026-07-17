/**
 * Zod schemas — one source of truth for the React forms and the Express
 * middleware. The frontend gets instant field errors; the backend re-parses
 * the same schema on every request, because client-side validation is a UX
 * feature and never a security boundary.
 */

import { z } from 'zod';
import { ROLES, STATUSES } from './types.js';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const nonEmpty = (label: string, max = 120) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} is too long`);

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase() // stored lowercase so the @unique index is a real uniqueness guarantee
  .min(1, 'Email is required')
  .email('Enter a valid email address')
  .max(254, 'Email is too long'); // RFC 5321 practical limit

/**
 * E.164-ish: optional '+', country code that cannot start with 0, then 7–14
 * more digits. Intentionally not a full libphonenumber validation — we reject
 * obvious garbage and let the delivery provider be the real authority.
 */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[1-9]\d{7,14}$/, 'Enter a valid phone number in E.164 format, e.g. +919876543210');

/**
 * Money crosses the wire as a string. A JSON number is an IEEE-754 double and
 * has already lost precision by the time Zod sees it, so we accept a number
 * only as a convenience, and hand Prisma a string for its Decimal column.
 */
export const salarySchema = z
  .union([z.string().trim(), z.number()])
  .superRefine((value, ctx) => {
    const asNumber = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(asNumber)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Salary must be a number' });
      return;
    }
    if (asNumber <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Salary must be greater than zero' });
    }
    if (!/^\d+(\.\d{1,2})?$/.test(String(value).trim())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Salary must have at most 2 decimal places',
      });
    }
    if (asNumber > 9_999_999_999.99) {
      // Decimal(12,2) — reject here rather than let Postgres throw at insert.
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Salary exceeds the maximum allowed' });
    }
  })
  .transform((value) => String(value).trim());

/** Accepts an ISO string or a Date; rejects future dates. */
export const joiningDateSchema = z.coerce
  .date({ invalid_type_error: 'Enter a valid date' })
  .refine((d) => d.getTime() <= Date.now(), 'Joining date cannot be in the future');

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters'); // bcrypt truncates past 72 bytes

export const roleSchema = z.enum(ROLES);
export const statusSchema = z.enum(STATUSES);

/**
 * Departments are a plain String column, not a DB enum, so adding "Legal"
 * never needs a migration. Validated as free text, seeded from DEPARTMENTS.
 */
export const departmentSchema = nonEmpty('Department', 60);
export const designationSchema = nonEmpty('Designation', 80);
export const nameSchema = nonEmpty('Name', 120);

export const uuidSchema = z.string().uuid('Invalid identifier');

/** Relative path or absolute URL; empty string normalises to null (= cleared). */
export const profileImageSchema = z
  .string()
  .trim()
  .max(2048)
  .transform((v) => (v.length === 0 ? null : v))
  .nullable();

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

export const loginSchema = z.object({
  email: emailSchema,
  // No shape rules on login: rejecting a "too short" password here leaks that
  // the policy exists and helps nobody. Credentials are simply right or wrong.
  password: z.string().min(1, 'Password is required'),
});
export type LoginInput = z.infer<typeof loginSchema>;

/**
 * `.strict()` on every request schema: an unknown key is an error, not
 * something to quietly ignore. Same whitelist reflex as WRITABLE_FIELDS —
 * a typo'd `salery` should fail loudly instead of leaving salary untouched.
 */
export const createEmployeeSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    phone: phoneSchema,
    /**
     * Optional: when omitted the service generates a random temporary password
     * and returns it ONCE in the 201 response for HR to hand over. Onboarding
     * shouldn't require whoever fills the form to invent a password and then
     * transmit it out-of-band anyway.
     */
    password: passwordSchema.optional(),
    department: departmentSchema,
    designation: designationSchema,
    salary: salarySchema,
    joiningDate: joiningDateSchema,
    status: statusSchema.default('ACTIVE'),
    role: roleSchema.default('EMPLOYEE'),
    // null is meaningful (top of the tree), undefined means "not provided".
    managerId: uuidSchema.nullable().optional(),
    profileImage: profileImageSchema.optional(),
  })
  .strict();
export type CreateEmployeeInput = z.input<typeof createEmployeeSchema>;
export type CreateEmployeeParsed = z.infer<typeof createEmployeeSchema>;

/**
 * Admin/HR edit. Every field optional — but note this schema only says the
 * SHAPE is valid. Whether this actor may write these particular fields on this
 * particular target is decided by canApplyEmployeeUpdate. Both run.
 *
 * `password` is absent by design: changing a password is its own endpoint with
 * its own confirmation, not a field on a bulk PATCH.
 */
export const updateEmployeeSchema = z
  .object({
    name: nameSchema.optional(),
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
    department: departmentSchema.optional(),
    designation: designationSchema.optional(),
    salary: salarySchema.optional(),
    joiningDate: joiningDateSchema.optional(),
    status: statusSchema.optional(),
    role: roleSchema.optional(),
    managerId: uuidSchema.nullable().optional(),
    profileImage: profileImageSchema.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, 'Provide at least one field to update');
export type UpdateEmployeeInput = z.input<typeof updateEmployeeSchema>;

/** What an EMPLOYEE may send about themselves — mirrors WRITABLE_FIELDS.EMPLOYEE. */
export const selfUpdateEmployeeSchema = z
  .object({
    phone: phoneSchema.optional(),
    profileImage: profileImageSchema.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, 'Provide at least one field to update');
export type SelfUpdateEmployeeInput = z.input<typeof selfUpdateEmployeeSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordSchema,
  })
  .strict()
  .refine((d) => d.currentPassword !== d.newPassword, {
    message: 'New password must differ from the current one',
    path: ['newPassword'],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const refreshTokenSchema = z.object({ refreshToken: z.string().min(1) }).strict();
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;

// ---------------------------------------------------------------------------
// GET /api/employees query
// ---------------------------------------------------------------------------

/** Hard ceiling on page size. See LIST_LIMIT_MAX's comment below. */
export const LIST_LIMIT_MAX = 100;
export const LIST_LIMIT_DEFAULT = 20;

/**
 * The ONLY sortable columns.
 *
 * A z.enum, not a string: `orderBy` is the one place a list endpoint touches
 * something structural rather than a value. Prisma parameterises `where`
 * values, but a column NAME cannot be a bind parameter — so an unvalidated
 * sortBy is passed through as an identifier. Anything outside this list must
 * fail at the edge with a 400 naming the field, never reach the query builder
 * and surface as a 500 (which leaks that the input was interpolated at all).
 */
export const SORTABLE_EMPLOYEE_FIELDS = ['name', 'joiningDate', 'salary', 'department'] as const;
export type SortableEmployeeField = (typeof SORTABLE_EMPLOYEE_FIELDS)[number];

/**
 * Express gives `?x=1` as a string and `?x=1&x=2` as an array. Normalise both
 * to an array so repeatable filters compose without the caller caring.
 */
const repeatable = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(
    (value) => (value === undefined ? undefined : Array.isArray(value) ? value : [value]),
    z.array(schema).optional(),
  );

/**
 * `?includeDeleted` with no value, `=true`, `=1` are all truthy; anything else
 * is false. z.coerce.boolean() is wrong here — it makes the STRING "false"
 * truthy, which is the opposite of what the caller typed.
 */
const booleanFlag = z
  .union([z.boolean(), z.string(), z.undefined()])
  .transform((v) => {
    if (v === undefined) return false;
    if (typeof v === 'boolean') return v;
    return ['', 'true', '1', 'yes'].includes(v.toLowerCase());
  })
  .pipe(z.boolean());

export const listEmployeesQuerySchema = z
  .object({
    /** Matched against name OR email, case-insensitive partial. */
    search: z.string().trim().max(120).optional(),
    department: repeatable(z.string().trim().min(1).max(60)),
    role: repeatable(roleSchema),
    status: statusSchema.optional(),
    managerId: uuidSchema.optional(),

    sortBy: z.enum(SORTABLE_EMPLOYEE_FIELDS).default('name'),
    sortOrder: z.enum(['asc', 'desc']).default('asc'),

    page: z.coerce.number().int().min(1, 'page must be at least 1').default(1),
    /**
     * Clamped to 100 rather than rejected. An uncapped limit is free DoS:
     * `?limit=10000000` asks Postgres to materialise the whole table, serialise
     * it to JSON and hold it in the API's heap. Clamping (not 400-ing) because
     * an over-large limit is usually a client computing a page size, not an
     * attack — it should get 100 rows, not an error. The protection is
     * identical either way, and it lives here at the schema so no caller can
     * reach the query without passing through it.
     */
    limit: z.coerce
      .number()
      .int()
      .min(1, 'limit must be at least 1')
      .default(LIST_LIMIT_DEFAULT)
      .transform((v) => Math.min(v, LIST_LIMIT_MAX)),

    /** Honoured only for actors who may delete; silently ignored otherwise. */
    includeDeleted: booleanFlag,
  })
  .strict();

export type ListEmployeesQueryInput = z.input<typeof listEmployeesQuerySchema>;
export type ListEmployeesQuery = z.infer<typeof listEmployeesQuerySchema>;

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface Paginated<T> {
  data: T[];
  pagination: PaginationMeta;
}

// ---------------------------------------------------------------------------
// Organization hierarchy
// ---------------------------------------------------------------------------

/** Matches MAX_TREE_DEPTH in hierarchy.service.ts. */
export const MAX_TREE_DEPTH = 100;

/**
 * `null` is a meaningful value here — it detaches the employee and makes them a
 * root — so the key is required and nullable rather than optional. An omitted
 * key and an explicit null must not mean the same thing on a targeted endpoint
 * whose entire job is setting this one field.
 */
export const assignManagerSchema = z
  .object({
    managerId: uuidSchema.nullable(),
  })
  .strict();
export type AssignManagerInput = z.infer<typeof assignManagerSchema>;

export const orgTreeQuerySchema = z
  .object({
    /** Return only the subtree rooted at this employee. */
    rootId: uuidSchema.optional(),
    /** Cap returned levels. Unlimited when omitted. */
    depth: z.coerce.number().int().min(1).max(MAX_TREE_DEPTH).optional(),
  })
  .strict();
export type OrgTreeQuery = z.infer<typeof orgTreeQuerySchema>;

export const reporteesQuerySchema = z
  .object({
    /**
     * Defaults to true: immediate reports are the common case, and the full
     * subtree is the expensive one — so the cheap answer is what you get unless
     * you ask otherwise.
     */
    direct: z
      .union([z.boolean(), z.string(), z.undefined()])
      .transform((v) => {
        if (v === undefined) return true;
        if (typeof v === 'boolean') return v;
        return !['false', '0', 'no'].includes(v.toLowerCase());
      })
      .pipe(z.boolean()),
  })
  .strict();
export type ReporteesQuery = z.infer<typeof reporteesQuerySchema>;
