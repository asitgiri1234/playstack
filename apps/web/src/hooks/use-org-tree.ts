'use client';

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { OrgTreeResponse } from '@playstack/shared';
import { api, ApiError } from '@/lib/api';
import { employeeKeys } from './use-employees';

export const orgKeys = {
  all: ['organization'] as const,
  tree: () => [...orgKeys.all, 'tree'] as const,
};

/**
 * The WHOLE tree in one request.
 *
 * GET /api/organization/tree returns every root with its nested reports and the
 * per-node counts, all built server-side in a single query (Phase 3). The UI
 * renders recursively from this one payload — there is no per-node fetch, which
 * on a deep org would be an N+1 waterfall that looks fine on the seed and dies
 * at scale.
 */
export function useOrgTree(): UseQueryResult<OrgTreeResponse, Error> {
  return useQuery({
    queryKey: orgKeys.tree(),
    queryFn: () => api.orgTree(),
    staleTime: 30_000,
  });
}

export function useAssignManager(): ReturnType<
  typeof useMutation<
    Awaited<ReturnType<typeof api.assignManager>>,
    Error,
    { id: string; managerId: string | null }
  >
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, managerId }: { id: string; managerId: string | null }) =>
      api.assignManager(id, managerId),
    onSuccess: async () => {
      // Reassignment moves a whole subtree; the tree, the employee lists and the
      // directory (manager names) all go stale.
      await queryClient.invalidateQueries({ queryKey: orgKeys.all });
      await queryClient.invalidateQueries({ queryKey: employeeKeys.all });
      await queryClient.invalidateQueries({ queryKey: ['directory'] });
      toast.success('Manager reassigned');
    },
    onError: (error) => {
      // A cycle (409) is surfaced inline on the form field, not here — see the
      // drawer. This toast is the fallback for everything else.
      if (error instanceof ApiError && error.status === 409) return;
      toast.error(error instanceof ApiError ? error.message : 'Could not reassign manager');
    },
  });
}
