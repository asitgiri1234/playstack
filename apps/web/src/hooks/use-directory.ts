'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LIST_LIMIT_MAX, type EmployeeDTO } from '@playstack/shared';
import { api } from '@/lib/api';

/**
 * A name lookup for the Manager column and the manager combobox.
 *
 * The list endpoint returns `managerId` but not the manager's name, so the
 * column would otherwise render a uuid or an em dash for everyone. This fetches
 * the roster once and caches it.
 *
 * KNOWN LIMITATION, worth naming rather than hiding: the API caps `limit` at
 * 100 (Phase 2, deliberately — an uncapped limit is a DoS). So beyond 100
 * employees this lookup is incomplete and some managers will render "—", and
 * the combobox will not offer everyone. The right fix is server-side: have the
 * list endpoint expand `manager: { id, name }` via a Prisma relation include,
 * which costs one join instead of a second round trip. That is an API change,
 * so it is flagged here rather than papered over with pagination loops that
 * would fire 20 requests on a 2,000-person org.
 *
 * Requires EMPLOYEE:READ_ALL, so it is only ever called from screens an
 * EMPLOYEE cannot reach.
 */
export function useDirectory(enabled = true): {
  employees: EmployeeDTO[];
  namesById: Map<string, string>;
  isLoading: boolean;
} {
  const { data, isLoading } = useQuery({
    queryKey: ['directory'],
    queryFn: () => api.listEmployees(`limit=${String(LIST_LIMIT_MAX)}&sortBy=name&sortOrder=asc`),
    enabled,
    staleTime: 60_000,
  });

  const employees = useMemo(() => data?.data ?? [], [data]);

  const namesById = useMemo(() => {
    const map = new Map<string, string>();
    for (const employee of employees) map.set(employee.id, employee.name);
    return map;
  }, [employees]);

  return { employees, namesById, isLoading };
}
