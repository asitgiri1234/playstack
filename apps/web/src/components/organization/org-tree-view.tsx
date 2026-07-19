'use client';

import { useCallback, useMemo, useState } from 'react';
import { ChevronsDownUp, ChevronsUpDown, Network } from 'lucide-react';
import type { OrgTreeNode } from '@playstack/shared';
import { useOrgTree } from '@/hooks/use-org-tree';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { TreeProvider } from './tree-context';
import { TreeNode } from './tree-node';
import { NodeDetailDrawer } from './node-detail-drawer';
import { OrgTreeSkeleton } from './org-tree-skeleton';

/** Collects every node id, for expand-all. */
function collectIds(nodes: OrgTreeNode[], acc: Set<string> = new Set()): Set<string> {
  for (const n of nodes) {
    acc.add(n.id);
    collectIds(n.reports, acc);
  }
  return acc;
}

/** Roots + their immediate children — the default-open set. */
function firstLevelIds(nodes: OrgTreeNode[]): Set<string> {
  const ids = new Set<string>();
  for (const root of nodes) ids.add(root.id);
  return ids;
}

export function OrgTreeView(): React.JSX.Element {
  const { data, isLoading, isError, error, refetch } = useOrgTree();
  const roots = useMemo(() => data?.data ?? [], [data]);

  // Uncontrolled-until-loaded: seed the open set from the roots the first time
  // data arrives, so the default view is "roots + first level open".
  const [expanded, setExpanded] = useState<Set<string> | null>(null);
  const openSet = expanded ?? (roots.length > 0 ? firstLevelIds(roots) : new Set<string>());

  const [selected, setSelected] = useState<OrgTreeNode | null>(null);

  const isExpanded = useCallback((id: string) => openSet.has(id), [openSet]);
  const toggle = useCallback(
    (id: string) => {
      setExpanded((prev) => {
        const next = new Set(prev ?? firstLevelIds(roots));
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [roots],
  );

  const expandAll = (): void => setExpanded(collectIds(roots));
  const collapseAll = (): void => setExpanded(firstLevelIds(roots));

  if (isLoading) return <OrgTreeSkeleton />;

  if (isError) {
    return (
      <ErrorState
        description={
          error instanceof ApiError ? error.message : 'We could not load the organization chart.'
        }
        onRetry={() => void refetch()}
      />
    );
  }

  if (roots.length === 0) {
    return (
      <EmptyState
        icon={<Network className="h-8 w-8" aria-hidden />}
        title="No organization chart yet"
        description="Once employees and their reporting lines exist, the chart appears here."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-content">Organization</h1>
          <p className="mt-1 text-base text-content-muted">
            {roots.length === 1 ? 'Reporting structure' : `${roots.length} reporting lines`}
            {data !== undefined && data.orphanCount > 0
              ? ` · ${String(data.orphanCount)} unassigned surfaced as roots`
              : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={expandAll}>
            <ChevronsUpDown className="h-3.5 w-3.5" aria-hidden />
            Expand all
          </Button>
          <Button variant="secondary" size="sm" onClick={collapseAll}>
            <ChevronsDownUp className="h-3.5 w-3.5" aria-hidden />
            Collapse all
          </Button>
        </div>
      </div>

      {/*
        Rendered from the SINGLE tree payload — no per-node fetch. The API built
        the whole structure server-side in one query (Phase 3); the recursion
        below just walks it.

        overflow-auto makes a wide/deep tree PAN inside its own box rather than
        pushing the page sideways — a large org stays navigable instead of
        breaking the layout.
      */}
      <div className="overflow-auto rounded-lg border border-border bg-surface-sunken/40 p-8">
        <TreeProvider
          value={{ isExpanded, toggle, selectedId: selected?.id ?? null, select: setSelected }}
        >
          <ul role="tree" aria-label="Organization chart" className="flex w-max items-start gap-10">
            {roots.map((root) => (
              <TreeNode key={root.id} node={root} />
            ))}
          </ul>
        </TreeProvider>
      </div>

      <NodeDetailDrawer node={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
