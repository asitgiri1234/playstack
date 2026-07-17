/**
 * THE permission matrix. One definition, imported by both the Express
 * middleware and the React UI — so a button that renders and an endpoint that
 * accepts can never disagree.
 *
 * The UI uses this to decide what to *show*. The API uses it to decide what to
 * *allow*. Only the second one is security; the first is courtesy.
 */

import { MUTABLE_EMPLOYEE_FIELDS, type MutableEmployeeField, type Role } from './types.js';

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export const PERMISSIONS = [
  'EMPLOYEE:CREATE',
  'EMPLOYEE:READ_ALL',
  'EMPLOYEE:READ_SELF',
  'EMPLOYEE:UPDATE_ANY',
  'EMPLOYEE:UPDATE_SELF',
  'EMPLOYEE:DELETE',
  'ROLE:ASSIGN_ADMIN',
  'MANAGER:ASSIGN',
  'ORG:READ_TREE',
  'DASHBOARD:READ',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Role → permissions granted. Grants are explicit and non-inherited: there is
 * no "SUPER_ADMIN implies everything" shortcut, because an implicit-inherit
 * model makes it impossible to later carve out a permission a super admin
 * should NOT have (e.g. a break-glass audit action) without rewriting the
 * evaluator.
 *
 * `readonly Permission[]` + `satisfies` means a typo is a compile error and a
 * new Permission added to the union must be routed to a role deliberately.
 */
export const ROLE_PERMISSIONS = {
  SUPER_ADMIN: [
    'EMPLOYEE:CREATE',
    'EMPLOYEE:READ_ALL',
    'EMPLOYEE:READ_SELF',
    'EMPLOYEE:UPDATE_ANY',
    'EMPLOYEE:UPDATE_SELF',
    'EMPLOYEE:DELETE',
    'ROLE:ASSIGN_ADMIN',
    'MANAGER:ASSIGN',
    'ORG:READ_TREE',
    'DASHBOARD:READ',
  ],
  HR_MANAGER: [
    'EMPLOYEE:CREATE',
    'EMPLOYEE:READ_ALL',
    'EMPLOYEE:READ_SELF',
    'EMPLOYEE:UPDATE_ANY',
    'EMPLOYEE:UPDATE_SELF',
    'ORG:READ_TREE',
    'DASHBOARD:READ',
    // Deliberately absent: EMPLOYEE:DELETE, ROLE:ASSIGN_ADMIN, MANAGER:ASSIGN.
    // HR administers people; it does not reshape the org chart or mint admins.
  ],
  EMPLOYEE: ['EMPLOYEE:READ_SELF', 'EMPLOYEE:UPDATE_SELF', 'ORG:READ_TREE'],
} as const satisfies Record<Role, readonly Permission[]>;

/**
 * The single authorization question: may this role do this thing at all?
 *
 * Scope ("...to WHICH record?") is a separate question — READ_SELF/UPDATE_SELF
 * grant the verb, and the caller still has to prove actor.id === target.id.
 * Keeping those two checks separate is why this function needs no ids.
 */
export function can(role: Role, permission: Permission): boolean {
  const granted: readonly Permission[] = ROLE_PERMISSIONS[role];
  return granted.includes(permission);
}

/** All permissions for a role — handy for stamping a token or priming the UI. */
export function permissionsFor(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

/** True if the role holds every listed permission. Empty list is vacuously true. */
export function canAll(role: Role, permissions: readonly Permission[]): boolean {
  return permissions.every((p) => can(role, p));
}

/** True if the role holds at least one of the listed permissions. */
export function canAny(role: Role, permissions: readonly Permission[]): boolean {
  return permissions.some((p) => can(role, p));
}

// ---------------------------------------------------------------------------
// Field-level write control
// ---------------------------------------------------------------------------

/**
 * Per-role whitelist of Employee fields that role may write.
 *
 * Whitelist, never blacklist: a column added to schema.prisma next month is
 * unwritable by every role until someone consciously lists it here. The
 * failure mode of forgetting is "HR can't edit the new field" (a bug report),
 * not "interns can edit salary" (an incident).
 */
export const WRITABLE_FIELDS = {
  // Every mutable field, spread from the canonical list so SUPER_ADMIN cannot
  // silently drift out of date when a field is added to the domain.
  SUPER_ADMIN: [...MUTABLE_EMPLOYEE_FIELDS],

  // Same field set as SUPER_ADMIN. HR's two limits are value- and
  // target-dependent, not field-dependent, so they cannot live in a static
  // list — canWriteField and canAssignRole enforce them:
  //   1. no writes at all to a target whose CURRENT role is SUPER_ADMIN
  //   2. may not set `role` to SUPER_ADMIN (that needs ROLE:ASSIGN_ADMIN)
  HR_MANAGER: [...MUTABLE_EMPLOYEE_FIELDS],

  // Everything else about an employee — salary, role, manager, status — is
  // decided about them, not by them. Self-only scope is enforced by the caller.
  EMPLOYEE: ['phone', 'profileImage'],
} as const satisfies Record<Role, readonly MutableEmployeeField[]>;

/**
 * Narrow an arbitrary incoming key to a known mutable field.
 * Request bodies are `unknown` until proven otherwise; this is the gate.
 */
export function isMutableEmployeeField(field: string): field is MutableEmployeeField {
  return (MUTABLE_EMPLOYEE_FIELDS as readonly string[]).includes(field);
}

/**
 * May `actorRole` write `field` on a record whose CURRENT role is `targetRole`?
 *
 * Encodes the HR-cannot-touch-Super-Admin rule. Two things this deliberately
 * does NOT decide, because the arguments cannot express them:
 *
 *  - Self-scope. EMPLOYEE may write phone/profileImage on THEIR OWN record;
 *    this function says nothing about whose record it is. The caller must
 *    already have established actor.id === target.id.
 *  - The *new value* of `role`. "HR may not set role to SUPER_ADMIN" is a
 *    check on the incoming value, not on the field name — see canAssignRole.
 *
 * Both are enforced together by canApplyEmployeeUpdate below; prefer that at
 * call sites unless you genuinely only have a field name.
 */
export function canWriteField(
  actorRole: Role,
  targetRole: Role,
  field: MutableEmployeeField,
): boolean {
  // A Super Admin is not administrable by HR at all. Checked before the field
  // whitelist so it also blocks harmless-looking writes (`phone`) that would
  // otherwise be a foothold for account takeover via a password-reset flow.
  if (actorRole === 'HR_MANAGER' && targetRole === 'SUPER_ADMIN') return false;

  const allowed: readonly MutableEmployeeField[] = WRITABLE_FIELDS[actorRole];
  return allowed.includes(field);
}

/**
 * May `actorRole` set someone's role to `nextRole`?
 *
 * Split out from canWriteField because it inspects the incoming VALUE. Gated
 * on ROLE:ASSIGN_ADMIN so the rule lives in the matrix, not in a second copy
 * of the role list.
 */
export function canAssignRole(actorRole: Role, nextRole: Role): boolean {
  if (nextRole === 'SUPER_ADMIN') return can(actorRole, 'ROLE:ASSIGN_ADMIN');
  return canWriteFieldName(actorRole, 'role');
}

/** WRITABLE_FIELDS membership only — no target rules. Internal helper. */
function canWriteFieldName(actorRole: Role, field: MutableEmployeeField): boolean {
  const allowed: readonly MutableEmployeeField[] = WRITABLE_FIELDS[actorRole];
  return allowed.includes(field);
}

/** Context for a full update decision. */
export interface UpdateContext {
  actorRole: Role;
  actorId: string;
  targetRole: Role;
  targetId: string;
}

export type UpdateDecision =
  | { allowed: true; fields: readonly MutableEmployeeField[] }
  | { allowed: false; reason: string; rejectedFields: readonly string[] };

/**
 * The complete write decision: verb + scope + field whitelist + value rules.
 *
 * Returns the accepted field list rather than a bare boolean so the caller can
 * build its Prisma `data` object from THIS list instead of from the request
 * body — the body can't smuggle in a key the matrix never approved.
 *
 * `patch` is `Record<string, unknown>` because it is untrusted input; every key
 * is proven to be a mutable field before it is used.
 */
export function canApplyEmployeeUpdate(
  ctx: UpdateContext,
  patch: Record<string, unknown>,
): UpdateDecision {
  const isSelf = ctx.actorId === ctx.targetId;

  // Verb check first: without UPDATE_ANY, the only editable record is your own.
  const mayUpdateOthers = can(ctx.actorRole, 'EMPLOYEE:UPDATE_ANY');
  const mayUpdateSelf = can(ctx.actorRole, 'EMPLOYEE:UPDATE_SELF');
  if (!isSelf && !mayUpdateOthers) {
    return {
      allowed: false,
      reason: 'Not permitted to update other employees.',
      rejectedFields: [],
    };
  }
  if (isSelf && !mayUpdateSelf) {
    return { allowed: false, reason: 'Not permitted to update own record.', rejectedFields: [] };
  }

  const accepted: MutableEmployeeField[] = [];
  const rejected: string[] = [];

  for (const key of Object.keys(patch)) {
    if (!isMutableEmployeeField(key)) {
      rejected.push(key);
      continue;
    }
    if (!canWriteField(ctx.actorRole, ctx.targetRole, key)) {
      rejected.push(key);
      continue;
    }
    // Value-level rule: privilege escalation is a role WRITE, not a role read.
    if (key === 'role') {
      const nextRole = patch[key];
      if (!isRole(nextRole) || !canAssignRole(ctx.actorRole, nextRole)) {
        rejected.push(key);
        continue;
      }
    }
    accepted.push(key);
  }

  if (rejected.length > 0) {
    // Fail the whole patch rather than silently dropping fields: a partial
    // apply makes the client believe a write landed when it didn't.
    return {
      allowed: false,
      reason: `Not permitted to write: ${rejected.join(', ')}`,
      rejectedFields: rejected,
    };
  }

  return { allowed: true, fields: accepted };
}

function isRole(value: unknown): value is Role {
  return value === 'SUPER_ADMIN' || value === 'HR_MANAGER' || value === 'EMPLOYEE';
}
