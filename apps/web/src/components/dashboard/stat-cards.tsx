'use client';

import { Building2, UserCheck, Users, UserX } from 'lucide-react';
import type { EmployeeStats } from '@/lib/api';
import { Skeleton } from '@/components/ui/states';

interface Card {
  key: keyof Pick<
    EmployeeStats,
    'totalEmployees' | 'activeEmployees' | 'inactiveEmployees' | 'departmentCount'
  >;
  label: string;
  icon: typeof Users;
}

// Four uniform, calm cards — no per-card colour. The icon is the only mark, and
// it stays muted; the number carries the card.
const CARDS: Card[] = [
  { key: 'totalEmployees', label: 'Total employees', icon: Users },
  { key: 'activeEmployees', label: 'Active', icon: UserCheck },
  { key: 'inactiveEmployees', label: 'Inactive', icon: UserX },
  { key: 'departmentCount', label: 'Departments', icon: Building2 },
];

export function StatCards({
  stats,
  isLoading,
}: {
  stats: EmployeeStats | undefined;
  isLoading: boolean;
}): React.JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {CARDS.map((card) => (
        <div
          key={card.key}
          className="rounded-lg border border-border bg-surface p-4 transition-colors hover:border-border-strong"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-content-muted">{card.label}</p>
            <card.icon className="h-3.5 w-3.5 text-content-subtle" aria-hidden />
          </div>
          {isLoading || stats === undefined ? (
            // A skeleton, never a literal 0 mid-fetch — 0 reads as real data and
            // "0 employees" is alarming when it just means "loading".
            <Skeleton className="mt-3 h-8 w-14" />
          ) : (
            <p className="tabular mt-2 text-3xl font-semibold text-content">{stats[card.key]}</p>
          )}
        </div>
      ))}
    </div>
  );
}
