'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePermission } from '@/lib/auth-context';
import { useStats } from '@/hooks/use-stats';
import { ErrorState } from '@/components/ui/states';
import { StatCards } from './stat-cards';
import { DepartmentBarChart } from './department-bar-chart';
import { RoleDonutChart } from './role-donut-chart';
import { StatusDonutChart } from './status-donut-chart';

export function DashboardView(): React.JSX.Element | null {
  const router = useRouter();
  const canReadDashboard = usePermission('DASHBOARD:READ');

  /**
   * Route guard: DASHBOARD:READ is SUPER_ADMIN + HR. An EMPLOYEE who reaches
   * /dashboard (typed URL, stale bookmark) is sent to their profile — the
   * sidebar never showed them the link, and the API would 403 the stats call
   * anyway. This is the courteous redirect, not the security boundary.
   */
  useEffect(() => {
    if (!canReadDashboard) router.replace('/profile');
  }, [canReadDashboard, router]);

  const { data: stats, isLoading, isError, refetch } = useStats();

  if (!canReadDashboard) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-display text-content">Dashboard</h1>
        <p className="mt-1 text-sm text-content-muted">Your organisation at a glance.</p>
      </div>

      {isError ? (
        <ErrorState
          description="We couldn't load the dashboard statistics."
          onRetry={() => void refetch()}
        />
      ) : (
        <>
          <StatCards stats={stats} isLoading={isLoading} />

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <DepartmentBarChart stats={stats} isLoading={isLoading} />
            <RoleDonutChart stats={stats} isLoading={isLoading} />
            <StatusDonutChart stats={stats} isLoading={isLoading} />
          </div>
        </>
      )}
    </div>
  );
}
