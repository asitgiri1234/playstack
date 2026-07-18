'use client';

import { useMemo } from 'react';
import {
  ROLES,
  canAssignRole,
  canWriteField,
  type MutableEmployeeField,
  type Role,
} from '@playstack/shared';
import { useAuth } from '@/lib/auth-context';

/**
 * Which fields the current actor may edit on a given target.
 *
 * Every answer comes from canWriteField / canAssignRole in the shared matrix —
 * the same functions sanitizeFields calls server-side. That is the whole point
 * of the shared package: a disabled input and a 403 are the same rule rendered
 * two ways, so they cannot disagree.
 *
 * This is presentation. The API re-checks everything; a disabled input is a
 * courtesy, and `disabled` is one devtools click away from gone.
 */
export function useFieldPermissions(targetRole: Role | undefined): {
  canWrite: (field: MutableEmployeeField) => boolean;
  assignableRoles: readonly Role[];
  isReadOnly: boolean;
} {
  const { user } = useAuth();

  return useMemo(() => {
    if (user === null) {
      return { canWrite: () => false, assignableRoles: [], isReadOnly: true };
    }

    const actorRole = user.role;
    // On a create form there is no target yet; the new hire's role is the
    // target role, and EMPLOYEE is the schema default.
    const effectiveTarget: Role = targetRole ?? 'EMPLOYEE';

    const canWrite = (field: MutableEmployeeField): boolean =>
      canWriteField(actorRole, effectiveTarget, field);

    /**
     * The Role select's options are filtered, not disabled.
     *
     * HR sees the select — they legitimately move people between EMPLOYEE and
     * HR_MANAGER — but SUPER_ADMIN is absent from its options, because
     * canAssignRole says HR may not grant it. Rendering it disabled would
     * advertise a privilege they cannot use; omitting it just reflects reality.
     */
    const assignableRoles = ROLES.filter((role) => canAssignRole(actorRole, role));

    // No writable field at all → the whole form is a read-only view. This is
    // how HR sees a Super Admin's record.
    const isReadOnly = !canWrite('name') && !canWrite('phone');

    return { canWrite, assignableRoles, isReadOnly };
  }, [user, targetRole]);
}
