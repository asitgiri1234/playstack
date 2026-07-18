'use client';

import type { EmployeeDTO } from '@playstack/shared';
import { useDeleteEmployee } from '@/hooks/use-employees';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export function DeleteEmployeeDialog({
  employee,
  open,
  onClose,
}: {
  employee: EmployeeDTO;
  open: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const deleteEmployee = useDeleteEmployee();

  const handleDelete = async (): Promise<void> => {
    try {
      // Awaited, then the hook invalidates and refetches. No optimistic
      // removal — the server re-parents this person's reports as part of the
      // delete, so the client cannot predict the resulting table.
      await deleteEmployee.mutateAsync(employee.id);
      onClose();
    } catch {
      // The mutation's onError already toasts; keep the dialog open so the
      // user can see the failure and retry rather than wondering what happened.
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Delete ${employee.name}?`}
      // Names the person — a generic "Are you sure?" is how the wrong row gets
      // deleted.
      description={`${employee.employeeCode} · ${employee.designation}, ${employee.department}`}
      footer={
        <>
          <Button
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={deleteEmployee.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => void handleDelete()}
            isLoading={deleteEmployee.isPending}
          >
            Delete employee
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-base text-content-muted">
        {/* States the actual server-side consequence (Phase 2 softDelete
            re-parents reports to the deleted employee's own manager). A
            confirmation that hides the side effect is not a confirmation. */}
        <p>
          Their direct reports will be reassigned to{' '}
          <span className="font-medium text-content">this employee&apos;s manager</span>, so nobody
          is left without one.
        </p>
        <p className="rounded-sm border border-border bg-surface-sunken px-3 py-2 text-sm">
          This is a soft delete. The record is retained for audit and can be restored by a Super
          Admin.
        </p>
      </div>
    </Dialog>
  );
}
