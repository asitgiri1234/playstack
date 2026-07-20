'use client';

import Link from 'next/link';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import type { EmployeeDTO, SortableEmployeeField } from '@playstack/shared';
import { cn } from '@/lib/utils';
import { formatDate, formatSalary } from '@/lib/format';
import { RoleBadge, StatusBadge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/states';
import { EmployeeRowActions } from './employee-row-actions';

interface Props {
  employees: EmployeeDTO[];
  managerNames: Map<string, string>;
  sortBy: SortableEmployeeField;
  sortOrder: 'asc' | 'desc';
  onSort: (field: SortableEmployeeField) => void;
  isFetching: boolean;
}

export function EmployeeTable({
  employees,
  managerNames,
  sortBy,
  sortOrder,
  onSort,
  isFetching,
}: Props): React.JSX.Element {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          {/* Sticky, muted header — a precise column strip that stays put while
              the body scrolls. */}
          <tr className="sticky top-0 z-10 border-b border-border bg-surface">
            <SortableHeader field="name" label="Employee" {...{ sortBy, sortOrder, onSort }} />
            <Th>Email</Th>
            <SortableHeader field="department" label="Dept" {...{ sortBy, sortOrder, onSort }} />
            <Th>Designation</Th>
            <SortableHeader
              field="salary"
              label="Salary"
              align="right"
              {...{ sortBy, sortOrder, onSort }}
            />
            <SortableHeader
              field="joiningDate"
              label="Joined"
              align="right"
              {...{ sortBy, sortOrder, onSort }}
            />
            <Th>Status</Th>
            <Th>Role</Th>
            <Th>Manager</Th>
            <th scope="col" className="w-10 px-3 py-2">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className={cn('transition-opacity', isFetching ? 'opacity-50' : 'opacity-100')}>
          {employees.map((employee) => (
            <tr
              key={employee.id}
              className="group border-b border-border last:border-0 transition-colors hover:bg-surface-hover"
            >
              <td className="h-12 px-3">
                <Link
                  href={`/employees/${employee.id}/edit`}
                  className="font-medium text-content transition-colors hover:text-primary-text"
                >
                  {employee.name}
                </Link>
                <div className="tabular text-xs text-content-subtle">{employee.employeeCode}</div>
              </td>
              <td className="px-3 text-content-muted">{employee.email}</td>
              <td className="px-3 text-content-muted">{employee.department}</td>
              <td className="px-3 text-content-muted">{employee.designation}</td>
              {/* Numeric columns are right-aligned and mono-tabular so magnitudes
                  line up and can be compared down the column. */}
              <td className="tabular px-3 text-right font-medium text-content">
                {formatSalary(employee.salary)}
              </td>
              <td className="tabular px-3 text-right text-content-muted">
                {formatDate(employee.joiningDate)}
              </td>
              <td className="px-3">
                <StatusBadge status={employee.status} />
              </td>
              <td className="px-3">
                <RoleBadge role={employee.role} />
              </td>
              <td className="px-3 text-content-muted">
                {employee.managerId === null ? (
                  <span className="text-content-subtle">—</span>
                ) : (
                  (managerNames.get(employee.managerId) ?? '—')
                )}
              </td>
              <td className="px-3">
                <EmployeeRowActions employee={employee} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  children,
  align = 'left',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
}): React.JSX.Element {
  return (
    // scope="col" is what ties a data cell to its header for a screen reader.
    <th
      scope="col"
      className={cn(
        'h-9 px-3 text-xs font-medium text-content-subtle',
        align === 'right' ? 'text-right' : 'text-left',
      )}
    >
      {children}
    </th>
  );
}

function SortableHeader({
  field,
  label,
  sortBy,
  sortOrder,
  onSort,
  align = 'left',
}: {
  field: SortableEmployeeField;
  label: string;
  sortBy: SortableEmployeeField;
  sortOrder: 'asc' | 'desc';
  onSort: (field: SortableEmployeeField) => void;
  align?: 'left' | 'right';
}): React.JSX.Element {
  const isActive = sortBy === field;
  const Icon = !isActive ? ChevronsUpDown : sortOrder === 'asc' ? ArrowUp : ArrowDown;

  return (
    <th
      scope="col"
      // aria-sort is how a screen reader announces the current sort; the arrow
      // glyph alone is invisible to it.
      aria-sort={isActive ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn('h-9 px-3', align === 'right' ? 'text-right' : 'text-left')}
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        className={cn(
          'inline-flex items-center gap-1 text-xs font-medium transition-colors hover:text-content',
          isActive ? 'text-content' : 'text-content-subtle',
          align === 'right' ? 'flex-row-reverse' : '',
        )}
      >
        {label}
        {/* Directional arrow in accent when this is the active sort; a faint
            neutral chevron otherwise, so sortability is discoverable but quiet. */}
        <Icon className={cn('h-3 w-3', isActive ? 'text-primary' : 'opacity-35')} aria-hidden />
      </button>
    </th>
  );
}

export function EmployeeTableSkeleton({ rows = 8 }: { rows?: number }): React.JSX.Element {
  return (
    <div className="p-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-border py-3 last:border-0">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="ml-auto h-4 w-20" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
      <span className="sr-only">Loading employees…</span>
    </div>
  );
}
