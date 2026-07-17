/**
 * Business rules that authorization alone cannot express.
 *
 * `can()` answers "may this ROLE do this VERB". These guards answer the
 * questions that depend on *state*: who the target is, how many Super Admins
 * are left, whether actor and target are the same person.
 *
 * Every function here is PURE — no Express, no Prisma, no clock. They take
 * already-fetched state and return a decision. That is what makes them
 * unit-testable without a database, and it is why the DB reads (e.g. counting
 * Super Admins) live in the caller: a guard that queries is a guard you can
 * only test by standing up Postgres.
 *
 * They return a result rather than throwing so a caller can evaluate several
 * and report all failures. Use `enforce()` to turn a denial into an AppError.
 */

import {
  MUTABLE_EMPLOYEE_FIELDS,
  canAssignRole,
  canWriteField,
  type Role,
} from '@playstack/shared';
import { AppError } from '../lib/errors.js';

export type GuardResult = { allowed: true } | { allowed: false; reason: string; status: 403 | 409 };

const allow = (): GuardResult => ({ allowed: true });
const deny = (reason: string, status: 403 | 409 = 403): GuardResult => ({
  allowed: false,
  reason,
  status,
});

/** Throws if the guard denied. Keeps route handlers to one line per rule. */
export function enforce(result: GuardResult): void {
  if (result.allowed) return;
  throw new AppError(
    result.status,
    result.status === 409 ? 'CONFLICT' : 'FORBIDDEN',
    result.reason,
  );
}

/** Evaluates guards in order and throws on the first denial. */
export function enforceAll(...results: readonly GuardResult[]): void {
  for (const r of results) enforce(r);
}

// ---------------------------------------------------------------------------

/**
 * Blocks deleting or demoting the final live Super Admin.
 *
 * Lockout here is unrecoverable: with zero Super Admins, nobody holds
 * ROLE:ASSIGN_ADMIN, so nobody can ever mint another one. The only fix is a
 * manual UPDATE against production. 409 rather than 403 — the actor genuinely
 * has the permission; the system state forbids it.
 *
 * `liveSuperAdminCount` must be counted by the caller with `deletedAt: null`.
 * A soft-deleted Super Admin cannot log in, so it cannot save you.
 */
export function assertNotLastSuperAdmin(input: {
  targetRole: Role;
  liveSuperAdminCount: number;
  /** DEMOTE also covers "set status INACTIVE" — an inactive admin can't log in. */
  operation: 'DELETE' | 'DEMOTE';
}): GuardResult {
  // Removing anyone who is not a Super Admin cannot reduce the count.
  if (input.targetRole !== 'SUPER_ADMIN') return allow();

  if (input.liveSuperAdminCount <= 1) {
    const verb = input.operation === 'DELETE' ? 'delete' : 'demote';
    return deny(
      `Cannot ${verb} the last remaining Super Admin — the system would be permanently locked out. Promote another Super Admin first.`,
      409,
    );
  }
  return allow();
}

/**
 * Only a SUPER_ADMIN may grant SUPER_ADMIN.
 *
 * Delegates to canAssignRole from the shared matrix rather than re-testing
 * `newRole === 'SUPER_ADMIN'` here — that comparison exists once, in
 * permissions.ts, and this guard must not become a second place to update.
 */
export function assertCanAssignRole(actorRole: Role, newRole: Role): GuardResult {
  if (!canAssignRole(actorRole, newRole)) {
    return deny(`Your role may not assign the role ${newRole}.`);
  }
  return allow();
}

/**
 * Nobody edits their own `role` field — not even a Super Admin.
 *
 * Forces a second admin into any privilege change, so a single compromised
 * session cannot escalate itself. It also stops a Super Admin from
 * accidentally demoting themselves into a lockout.
 *
 * `body` is untrusted, hence Record<string, unknown>. A `role` key that is
 * present but unchanged is still a denial: the honest response to "you may not
 * write this field" does not depend on the value happening to match.
 */
export function assertNotSelfRoleChange(
  actorId: string,
  targetId: string,
  body: Record<string, unknown>,
): GuardResult {
  if (actorId !== targetId) return allow();
  if (!Object.hasOwn(body, 'role')) return allow();

  return deny('You cannot change your own role. Another Super Admin must make this change.');
}

/**
 * HR gets 403 on ANY write to a Super Admin record.
 *
 * Derived from the matrix instead of restating `actor === HR && target === SA`:
 * if the actor cannot write a single field on this target, they have no
 * business writing to it at all. If permissions.ts ever relaxes that rule, this
 * guard relaxes with it — there is no second copy to forget.
 */
export function assertHRCannotTouchSuperAdmin(actorRole: Role, targetRole: Role): GuardResult {
  const canWriteAnything = MUTABLE_EMPLOYEE_FIELDS.some((field) =>
    canWriteField(actorRole, targetRole, field),
  );
  if (!canWriteAnything) {
    return deny(`Your role may not modify a ${targetRole} record.`);
  }
  return allow();
}

/**
 * The IDOR guard: on a self-scoped route, the :id in the URL must be your own.
 *
 * Without this, `GET /api/employees/<someone-else's-uuid>` passes authenticate
 * (you are logged in) and passes authorize (EMPLOYEE holds READ_SELF) and then
 * happily returns another person's salary. The permission grants the verb; only
 * this check binds it to a record.
 */
export function assertSelfScope(actorId: string, targetId: string): GuardResult {
  if (actorId !== targetId) {
    // Deliberately does not say "that record belongs to someone else" — the
    // message must not confirm the id exists.
    return deny('You may only access your own record.');
  }
  return allow();
}
