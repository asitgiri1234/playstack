'use client';

import Link from 'next/link';
import { Plus, Users } from 'lucide-react';
import { useEmployeeFilters } from '@/hooks/use-employee-filters';
import { useEmployees } from '@/hooks/use-employees';
import { useDirectory } from '@/hooks/use-directory';
import { usePermission } from '@/lib/auth-context';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { EmployeeFiltersBar } from './employee-filters';
import { EmployeePagination } from './employee-pagination';
import { EmployeeTable, EmployeeTableSkeleton } from './employee-table';

export function EmployeesView(): React.JSX.Element {
  const { filters, queryString, hasActiveFilters, setFilter, clearFilters, toggleSort } =
    useEmployeeFilters();

  /**
   * Server-driven. Every filter, sort and page change rewrites the URL, which
   * changes the query key, which issues a new request.
   *
   * The alternative — fetch everything once and filter the array in the
   * browser — breaks in three ways at once: it cannot paginate honestly, it
   * ships every salary to a client that may not be allowed to see them (the API
   * strips per-actor, so filtering client-side would mean asking for more than
   * you may have), and it collapses the moment the org outgrows one response.
   */
  const { data, isLoading, isFetching, isError, error, refetch } = useEmployees(queryString);
  const { namesById } = useDirectory();
  const canCreate = usePermission('EMPLOYEE:CREATE');

  const employees = data?.data ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-content">Employees</h1>
          <p className="mt-1 text-base text-content-muted">
            Manage your organisation&apos;s people, roles and reporting lines.
          </p>
        </div>
        {/* Rendered only for EMPLOYEE:CREATE holders — SUPER_ADMIN and HR. */}
        {canCreate ? (
          <Link
            href="/employees/new"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-sm border border-transparent bg-primary px-4 text-base font-medium text-content-inverted transition-colors hover:bg-primary-hover"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add employee
          </Link>
        ) : null}
      </div>

      <EmployeeFiltersBar
        filters={filters}
        hasActiveFilters={hasActiveFilters}
        setFilter={setFilter}
        clearFilters={clearFilters}
      />

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <EmployeesContent
          isLoading={isLoading}
          isError={isError}
          error={error}
          refetch={() => void refetch()}
          employeeCount={employees.length}
          hasActiveFilters={hasActiveFilters}
          clearFilters={clearFilters}
        >
          <EmployeeTable
            employees={employees}
            managerNames={namesById}
            sortBy={filters.sortBy}
            sortOrder={filters.sortOrder}
            onSort={toggleSort}
            isFetching={isFetching}
          />
          {data !== undefined ? (
            <EmployeePagination
              pagination={data.pagination}
              onPageChange={(page) => setFilter({ page })}
              onLimitChange={(limit) => setFilter({ limit, page: 1 })}
            />
          ) : null}
        </EmployeesContent>
      </div>
    </div>
  );
}

/** All three states, decided in one place so the table never renders half-loaded. */
function EmployeesContent({
  isLoading,
  isError,
  error,
  refetch,
  employeeCount,
  hasActiveFilters,
  clearFilters,
  children,
}: {
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  employeeCount: number;
  hasActiveFilters: boolean;
  clearFilters: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  if (isLoading) return <EmployeeTableSkeleton />;

  if (isError) {
    return (
      <ErrorState
        description={
          error instanceof ApiError
            ? error.message
            : 'We could not load employees. Check your connection and try again.'
        }
        onRetry={refetch}
      />
    );
  }

  if (employeeCount === 0) {
    /**
     * Two genuinely different empty states.
     *
     * "No employees yet" tells someone the database is bare; if the real cause
     * is a typo in the search box, that message sends them to look for a
     * seeding bug. The filtered variant names the cause and offers the fix.
     */
    return hasActiveFilters ? (
      <EmptyState
        icon={<Users className="h-8 w-8" aria-hidden />}
        title="No employees match these filters"
        description="Try a different search term, or clear the filters to see everyone."
        action={
          <Button variant="secondary" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        }
      />
    ) : (
      <EmptyState
        icon={<Users className="h-8 w-8" aria-hidden />}
        title="No employees yet"
        description="Once people are added to your organisation, they will appear here."
      />
    );
  }

  return <>{children}</>;
}
