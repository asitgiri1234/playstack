'use client';

import { Building2, UserCheck, Users, UserX } from 'lucide-react';
import type { EmployeeStats } from '@/lib/api';
import { Skeleton } from '@/components/ui/states';
import { cn } from '@/lib/utils';

interface Card {
  key: keyof Pick<
    EmployeeStats,
    'totalEmployees' | 'activeEmployees' | 'inactiveEmployees' | 'departmentCount'
  >;
  label: string;
  icon: typeof Users;
  accent: string;
}

const CARDS: Card[] = [
  { key: 'totalEmployees', label: 'Total Employees', icon: Users, accent: 'bg-chart-1' },
  { key: 'activeEmployees', label: 'Active', icon: UserCheck, accent: 'bg-success-600' },
  { key: 'inactiveEmployees', label: 'Inactive', icon: UserX, accent: 'bg-content-subtle' },
  { key: 'departmentCount', label: 'Departments', icon: Building2, accent: 'bg-chart-2' },
];

export function StatCards({
  stats,
  isLoading,
}: {
  stats: EmployeeStats | undefined;
  isLoading: boolean;
}): React.JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {CARDS.map((card) => (
        <div
          key={card.key}
          className="relative overflow-hidden rounded-lg border border-border bg-surface p-5"
        >
          {/* The "thin accent" — a hairline, not a garish coloured box. */}
          <span className={cn('absolute inset-x-0 top-0 h-0.5', card.accent)} aria-hidden />
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-content-muted">{card.label}</p>
              {isLoading || stats === undefined ? (
                // A skeleton, never a literal 0 mid-fetch — 0 reads as real data
                // and "0 employees" is alarming when it just means "loading".
                <Skeleton className="mt-2 h-9 w-16" />
              ) : (
                <p className="tabular mt-1.5 text-3xl font-semibold tracking-tight text-content">
                  {stats[card.key]}
                </p>
              )}
            </div>
            <div className="rounded-sm bg-surface-sunken p-2 text-content-subtle">
              <card.icon className="h-4 w-4" aria-hidden />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
