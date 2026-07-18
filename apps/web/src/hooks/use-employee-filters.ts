'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { LIST_LIMIT_DEFAULT, type SortableEmployeeField } from '@playstack/shared';

export interface EmployeeFilters {
  search: string;
  department: string[];
  role: string[];
  status: string;
  sortBy: SortableEmployeeField;
  sortOrder: 'asc' | 'desc';
  page: number;
  limit: number;
}

const DEFAULTS = {
  sortBy: 'name' as SortableEmployeeField,
  sortOrder: 'asc' as const,
  page: 1,
  limit: LIST_LIMIT_DEFAULT,
};

/**
 * THE URL IS THE STATE.
 *
 * Filters live in the query string, not in useState. This is not a stylistic
 * preference — it is what makes the view real:
 *
 *   - A filtered table can be linked to. "Everyone inactive in Sales" is a URL
 *     you paste into Slack, not a sequence of clicks you describe.
 *   - Refresh and back/forward work. useState resets to page 1 on reload, which
 *     silently discards what the user was looking at.
 *   - There is one source of truth. State in two places (URL + useState) drifts,
 *     and the bug always surfaces as "the table doesn't match the filters".
 *
 * The URL also mirrors the API's own query contract, so what you see in the
 * address bar is what the server was asked.
 */
export function useEmployeeFilters(): {
  filters: EmployeeFilters;
  queryString: string;
  hasActiveFilters: boolean;
  setFilter: (patch: Partial<EmployeeFilters>) => void;
  clearFilters: () => void;
  toggleSort: (field: SortableEmployeeField) => void;
} {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo<EmployeeFilters>(() => {
    const sortBy = searchParams.get('sortBy');
    const sortOrder = searchParams.get('sortOrder');
    const page = Number(searchParams.get('page') ?? DEFAULTS.page);
    const limit = Number(searchParams.get('limit') ?? DEFAULTS.limit);

    return {
      search: searchParams.get('search') ?? '',
      // getAll: the API accepts repeats, so ?department=Sales&department=HR is
      // the wire format and the URL format both.
      department: searchParams.getAll('department'),
      role: searchParams.getAll('role'),
      status: searchParams.get('status') ?? '',
      sortBy: (sortBy as SortableEmployeeField | null) ?? DEFAULTS.sortBy,
      sortOrder: sortOrder === 'desc' ? 'desc' : DEFAULTS.sortOrder,
      page: Number.isFinite(page) && page > 0 ? page : DEFAULTS.page,
      limit: Number.isFinite(limit) && limit > 0 ? limit : DEFAULTS.limit,
    };
  }, [searchParams]);

  /** Only what the API needs, and only when it differs from the default. */
  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.search.length > 0) params.set('search', filters.search);
    for (const d of filters.department) params.append('department', d);
    for (const r of filters.role) params.append('role', r);
    if (filters.status.length > 0) params.set('status', filters.status);
    params.set('sortBy', filters.sortBy);
    params.set('sortOrder', filters.sortOrder);
    params.set('page', String(filters.page));
    params.set('limit', String(filters.limit));
    return params.toString();
  }, [filters]);

  const hasActiveFilters =
    filters.search.length > 0 ||
    filters.department.length > 0 ||
    filters.role.length > 0 ||
    filters.status.length > 0;

  const setFilter = useCallback(
    (patch: Partial<EmployeeFilters>) => {
      const params = new URLSearchParams(searchParams.toString());

      for (const [key, value] of Object.entries(patch)) {
        params.delete(key);
        if (Array.isArray(value)) {
          for (const v of value) params.append(key, String(v));
        } else if (value !== '' && value !== undefined) {
          params.set(key, String(value));
        }
      }

      // Any filter change resets to page 1 — staying on page 4 of a result set
      // that now has 2 pages shows an empty table and looks like a bug.
      if (!('page' in patch)) params.set('page', '1');

      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const clearFilters = useCallback(() => {
    router.push(pathname, { scroll: false });
  }, [router, pathname]);

  const toggleSort = useCallback(
    (field: SortableEmployeeField) => {
      // Same column toggles direction; a new column starts ascending, which is
      // what people expect from a fresh sort.
      const isSame = filters.sortBy === field;
      setFilter({
        sortBy: field,
        sortOrder: isSame && filters.sortOrder === 'asc' ? 'desc' : 'asc',
      });
    },
    [filters.sortBy, filters.sortOrder, setFilter],
  );

  return { filters, queryString, hasActiveFilters, setFilter, clearFilters, toggleSort };
}
