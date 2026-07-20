'use client';

import { useEmployee } from '@/hooks/use-employees';
import { ApiError } from '@/lib/api';
import { EmployeeForm } from './employee-form';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { RoleBadge, StatusBadge } from '@/components/ui/badge';

export function EditEmployeeView({ id }: { id: string }): React.JSX.Element {
  const { data: employee, isLoading, isError, error, refetch } = useEmployee(id);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="rounded-lg border border-border bg-surface p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (isError || employee === undefined) {
    // 403 and 404 are different facts and deserve different words: one means
    // "not yours", the other "not there".
    const isForbidden = error instanceof ApiError && error.status === 403;
    const isMissing = error instanceof ApiError && error.status === 404;
    return (
      <ErrorState
        title={isForbidden ? 'Not permitted' : isMissing ? 'Employee not found' : undefined}
        description={
          isForbidden
            ? 'You do not have permission to view this employee.'
            : isMissing
              ? 'This employee does not exist, or has been deleted.'
              : 'We could not load this employee. Please try again.'
        }
        onRetry={() => void refetch()}
      />
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5">
        <h1 className="text-2xl font-semibold tracking-display text-content">{employee.name}</h1>
        <span className="tabular text-sm text-content-subtle">{employee.employeeCode}</span>
        <StatusBadge status={employee.status} />
        <RoleBadge role={employee.role} />
      </div>

      <div className="rounded-lg border border-border bg-surface p-6">
        <EmployeeForm employee={employee} />
      </div>
    </>
  );
}
