/**
 * Pure unit tests for the escalation traps. No database, no Express, no HTTP —
 * if these need a server to run, the guards aren't pure.
 */

import { describe, expect, it } from 'vitest';
import {
  assertCanAssignRole,
  assertHRCannotTouchSuperAdmin,
  assertNotLastSuperAdmin,
  assertNotSelfRoleChange,
  assertSelfScope,
  enforce,
} from '../services/guards.js';
import { AppError } from '../lib/errors.js';

describe('guards: assertNotLastSuperAdmin', () => {
  it('cannot delete the last SUPER_ADMIN', () => {
    const result = assertNotLastSuperAdmin({
      targetRole: 'SUPER_ADMIN',
      liveSuperAdminCount: 1,
      operation: 'DELETE',
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.status).toBe(409);
  });

  it('cannot demote the last SUPER_ADMIN', () => {
    const result = assertNotLastSuperAdmin({
      targetRole: 'SUPER_ADMIN',
      liveSuperAdminCount: 1,
      operation: 'DEMOTE',
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toMatch(/last remaining Super Admin/i);
  });

  it('allows deleting a SUPER_ADMIN when another one remains', () => {
    expect(
      assertNotLastSuperAdmin({
        targetRole: 'SUPER_ADMIN',
        liveSuperAdminCount: 2,
        operation: 'DELETE',
      }).allowed,
    ).toBe(true);
  });

  it('allows deleting a non-SUPER_ADMIN regardless of the admin count', () => {
    expect(
      assertNotLastSuperAdmin({
        targetRole: 'EMPLOYEE',
        liveSuperAdminCount: 1,
        operation: 'DELETE',
      }).allowed,
    ).toBe(true);
  });

  it('treats a zero count as a lockout rather than allowing the write', () => {
    // Defensive: a miscounted 0 must fail closed, never open.
    expect(
      assertNotLastSuperAdmin({
        targetRole: 'SUPER_ADMIN',
        liveSuperAdminCount: 0,
        operation: 'DELETE',
      }).allowed,
    ).toBe(false);
  });
});

describe('guards: assertCanAssignRole', () => {
  it('HR_MANAGER cannot assign SUPER_ADMIN role', () => {
    expect(assertCanAssignRole('HR_MANAGER', 'SUPER_ADMIN').allowed).toBe(false);
  });

  it('EMPLOYEE cannot assign any role', () => {
    expect(assertCanAssignRole('EMPLOYEE', 'EMPLOYEE').allowed).toBe(false);
    expect(assertCanAssignRole('EMPLOYEE', 'HR_MANAGER').allowed).toBe(false);
    expect(assertCanAssignRole('EMPLOYEE', 'SUPER_ADMIN').allowed).toBe(false);
  });

  it('SUPER_ADMIN may assign SUPER_ADMIN', () => {
    expect(assertCanAssignRole('SUPER_ADMIN', 'SUPER_ADMIN').allowed).toBe(true);
  });

  it('HR_MANAGER may assign non-admin roles', () => {
    expect(assertCanAssignRole('HR_MANAGER', 'EMPLOYEE').allowed).toBe(true);
    expect(assertCanAssignRole('HR_MANAGER', 'HR_MANAGER').allowed).toBe(true);
  });
});

describe('guards: assertNotSelfRoleChange', () => {
  it('nobody can change their own role, not even a SUPER_ADMIN', () => {
    expect(assertNotSelfRoleChange('same-id', 'same-id', { role: 'SUPER_ADMIN' }).allowed).toBe(
      false,
    );
  });

  it('rejects a self role write even when the value is unchanged', () => {
    // "You may not write this field" must not depend on the value submitted.
    expect(assertNotSelfRoleChange('same-id', 'same-id', { role: 'EMPLOYEE' }).allowed).toBe(false);
  });

  it('allows editing your own non-role fields', () => {
    expect(assertNotSelfRoleChange('same-id', 'same-id', { phone: '+919810000001' }).allowed).toBe(
      true,
    );
  });

  it("allows changing someone else's role", () => {
    expect(assertNotSelfRoleChange('actor-id', 'other-id', { role: 'HR_MANAGER' }).allowed).toBe(
      true,
    );
  });
});

describe('guards: assertHRCannotTouchSuperAdmin', () => {
  it('HR_MANAGER cannot touch a SUPER_ADMIN record', () => {
    expect(assertHRCannotTouchSuperAdmin('HR_MANAGER', 'SUPER_ADMIN').allowed).toBe(false);
  });

  it('HR_MANAGER may touch HR_MANAGER and EMPLOYEE records', () => {
    expect(assertHRCannotTouchSuperAdmin('HR_MANAGER', 'HR_MANAGER').allowed).toBe(true);
    expect(assertHRCannotTouchSuperAdmin('HR_MANAGER', 'EMPLOYEE').allowed).toBe(true);
  });

  it('SUPER_ADMIN may touch a SUPER_ADMIN record', () => {
    expect(assertHRCannotTouchSuperAdmin('SUPER_ADMIN', 'SUPER_ADMIN').allowed).toBe(true);
  });

  it('does not itself block an EMPLOYEE — scope is a different guard', () => {
    // EMPLOYEE holds phone/profileImage in WRITABLE_FIELDS, so at the FIELD
    // level "employee writes a phone number" is legal; what makes it illegal on
    // someone else's record is scope, not fields. authorize() (no
    // EMPLOYEE:UPDATE_ANY) and assertSelfScope() stop this request long before
    // it reaches here. Asserting `false` would mean asking one guard to enforce
    // three rules — exactly the coupling this file exists to avoid.
    expect(assertHRCannotTouchSuperAdmin('EMPLOYEE', 'SUPER_ADMIN').allowed).toBe(true);
  });
});

describe('guards: assertSelfScope', () => {
  it('denies access to another id (IDOR)', () => {
    expect(assertSelfScope('actor-id', 'victim-id').allowed).toBe(false);
  });

  it('allows access to your own id', () => {
    expect(assertSelfScope('actor-id', 'actor-id').allowed).toBe(true);
  });

  it('does not confirm whether the other id exists', () => {
    const result = assertSelfScope('actor-id', 'victim-id');
    if (!result.allowed) {
      expect(result.reason).toBe('You may only access your own record.');
      expect(result.reason).not.toMatch(/exist|found|belongs/i);
    }
  });
});

describe('guards: enforce', () => {
  it('throws an AppError carrying the guard status', () => {
    expect(() => {
      enforce(
        assertNotLastSuperAdmin({
          targetRole: 'SUPER_ADMIN',
          liveSuperAdminCount: 1,
          operation: 'DELETE',
        }),
      );
    }).toThrow(AppError);
  });

  it('does nothing when the guard allows', () => {
    expect(() => {
      enforce(assertSelfScope('a', 'a'));
    }).not.toThrow();
  });
});
