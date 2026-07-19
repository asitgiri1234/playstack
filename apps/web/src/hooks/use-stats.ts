'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { api, type EmployeeStats } from '@/lib/api';
import { employeeKeys } from './use-employees';

/**
 * The dashboard's ONE request.
 *
 * GET /api/employees/stats returns counts and groupings already aggregated in
 * Postgres (Phase 2). The dashboard must never fetch the employee list and
 * count client-side — that ships the whole roster to compute five numbers and
 * gets slower as the company grows. Keyed under the employee namespace so any
 * mutation (create/update/delete) invalidates the stats too.
 */
export function useStats(): UseQueryResult<EmployeeStats, Error> {
  return useQuery({
    queryKey: employeeKeys.stats(),
    queryFn: () => api.stats(),
    staleTime: 30_000,
  });
}
