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
    password: passwordSchema,
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

/** List/filter query. Coerced because query strings arrive as text. */
export const employeeQuerySchema = z
  .object({
    search: z.string().trim().max(120).optional(),
    department: z.string().trim().max(60).optional(),
    status: statusSchema.optional(),
    role: roleSchema.optional(),
    managerId: uuidSchema.optional(),
    // Only a SUPER_ADMIN view should ever set this; the API gates it.
    includeDeleted: z.coerce.boolean().default(false),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    sortBy: z.enum(['name', 'joiningDate', 'salary', 'createdAt']).default('createdAt'),
    sortDir: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict();
export type EmployeeQueryInput = z.input<typeof employeeQuerySchema>;
export type EmployeeQueryParsed = z.infer<typeof employeeQuerySchema>;
