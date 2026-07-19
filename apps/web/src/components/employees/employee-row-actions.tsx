'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import type { EmployeeDTO } from '@playstack/shared';
import { usePermission } from '@/lib/auth-context';
import { DeleteEmployeeDialog } from './delete-employee-dialog';

export function EmployeeRowActions({
  employee,
}: {
  employee: EmployeeDTO;
}): React.JSX.Element | null {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Both delegate to can() from the shared matrix. UPDATE_ANY: SUPER_ADMIN +
  // HR. DELETE: SUPER_ADMIN only.
  const canEdit = usePermission('EMPLOYEE:UPDATE_ANY');
  const canDelete = usePermission('EMPLOYEE:DELETE');

  // Nothing to offer — render no trigger at all rather than an empty menu.
  if (!canEdit && !canDelete) return null;

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          onBlur={() => setTimeout(() => setMenuOpen(false), 120)}
          aria-label={`Actions for ${employee.name}`}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          className="rounded-sm p-1 text-content-subtle transition-colors hover:bg-surface-sunken hover:text-content"
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden />
        </button>

        {menuOpen ? (
          <div
            role="menu"
            className="absolute right-0 z-20 mt-1 w-40 rounded-sm border border-border bg-surface-raised py-1 shadow-md"
          >
            {canEdit ? (
              <Link
                role="menuitem"
                href={`/employees/${employee.id}/edit`}
                className="flex items-center gap-2 px-3 py-1.5 text-base text-content hover:bg-surface-hover"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden />
                Edit
              </Link>
            ) : null}
            {canDelete ? (
              <button
                type="button"
                role="menuitem"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmOpen(true);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-base text-danger-text hover:bg-danger-surface"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Delete
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <DeleteEmployeeDialog
        employee={employee}
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
      />
    </>
  );
}
