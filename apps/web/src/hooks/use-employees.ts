'use client';

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { EmployeeDTO } from '@playstack/shared';
import { api, ApiError, type EmployeeListResponse } from '@/lib/api';

/**
 * Query keys.
 *
 * The list key carries the FULL query string. Two different filter
 * combinations are two different resources, and keying them the same would
 * serve Sales results under a Finance filter from cache. Everything hangs off
 * `['employees']` so one invalidation covers every filtered variant.
 */
export const employeeKeys = {
  all: ['employees'] as const,
  lists: () => [...employeeKeys.all, 'list'] as const,
  list: (queryString: string) => [...employeeKeys.lists(), queryString] as const,
  details: () => [...employeeKeys.all, 'detail'] as const,
  detail: (id: string) => [...employeeKeys.details(), id] as const,
  stats: () => [...employeeKeys.all, 'stats'] as const,
};

export function useEmployees(queryString: string): UseQueryResult<EmployeeListResponse, Error> {
  return useQuery({
    queryKey: employeeKeys.list(queryString),
    queryFn: () => api.listEmployees(queryString),
    // Keeps the previous page visible while the next loads, so paging doesn't
    // flash a skeleton over a table that is about to look almost identical.
    placeholderData: (previous) => previous,
  });
}

export function useEmployee(id: string, enabled = true): UseQueryResult<EmployeeDTO, Error> {
  return useQuery({
    queryKey: employeeKeys.detail(id),
    queryFn: async () => (await api.getEmployee(id)).data,
    enabled: enabled && id.length > 0,
  });
}

/** Everything a mutation must invalidate. Lists and stats both go stale. */
function useInvalidateEmployees(): () => Promise<void> {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: employeeKeys.all });
  };
}

export function useCreateEmployee(): ReturnType<
  typeof useMutation<{ data: EmployeeDTO; temporaryPassword?: string }, Error, unknown>
> {
  const invalidate = useInvalidateEmployees();
  return useMutation({
    mutationFn: (body: unknown) => api.createEmployee(body),
    onSuccess: async () => {
      await invalidate();
    },
  });
}

export function useUpdateEmployee(
  id: string,
): ReturnType<typeof useMutation<{ data: EmployeeDTO }, Error, unknown>> {
  const invalidate = useInvalidateEmployees();
  return useMutation({
    mutationFn: (body: unknown) => api.updateEmployee(id, body),
    onSuccess: async () => {
      await invalidate();
    },
  });
}

export function useUpdateSelf(): ReturnType<
  typeof useMutation<{ data: EmployeeDTO }, Error, unknown>
> {
  const invalidate = useInvalidateEmployees();
  return useMutation({
    mutationFn: (body: unknown) => api.updateSelf(body),
    onSuccess: async () => {
      await invalidate();
    },
  });
}

export function useDeleteEmployee(): ReturnType<
  typeof useMutation<{ data: EmployeeDTO }, Error, string>
> {
  const invalidate = useInvalidateEmployees();
  return useMutation({
    mutationFn: (id: string) => api.deleteEmployee(id),
    // No optimistic update: awaiting the response and refetching is the honest
    // sequence. A soft delete re-parents the whole subtree server-side (Phase
    // 2), so the local cache cannot predict the result — an optimistic removal
    // would show a tree the server never agreed to.
    onSuccess: async () => {
      await invalidate();
      toast.success('Employee deleted');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not delete employee');
    },
  });
}
