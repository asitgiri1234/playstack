'use client';

import { ChevronRight } from 'lucide-react';
import type { OrgTreeNode } from '@playstack/shared';
import { cn } from '@/lib/utils';
import { initialsOf } from '@/lib/format';
import { RoleBadge } from '@/components/ui/badge';
import { useTreeContext } from './tree-context';

/**
 * One node, and its children by recursion. Kept deliberately small: it renders
 * a card, a connector, and — if it has reports and is expanded — a row of child
 * <TreeNode>s beneath. All expand state and selection come from context, so the
 * recursion carries no props but the node itself.
 */
export function TreeNode({ node }: { node: OrgTreeNode }): React.JSX.Element {
  const { isExpanded, toggle, selectedId, select } = useTreeContext();
  const hasReports = node.reports.length > 0;
  const expanded = isExpanded(node.id);
  const selected = selectedId === node.id;

  return (
    <li className="flex flex-col items-center">
      <div className="flex flex-col items-center">
        <div
          role="treeitem"
          aria-expanded={hasReports ? expanded : undefined}
          aria-selected={selected}
          tabIndex={0}
          onClick={() => select(node)}
          onKeyDown={(e) => {
            // Enter/Space open the detail; the caret handles expand/collapse so
            // the two actions stay distinct for keyboard users.
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              select(node);
            }
          }}
          className={cn(
            'relative w-56 cursor-pointer rounded-lg border bg-surface p-3 text-left shadow-sm transition-colors',
            selected ? 'border-primary' : 'border-border hover:border-border-strong',
          )}
        >
          <div className="flex items-start gap-2.5">
            <Avatar node={node} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-content">{node.name}</p>
              <p className="truncate text-xs text-content-muted">{node.designation}</p>
              <div className="mt-2 flex items-center gap-1.5">
                <RoleBadge role={node.role} />
              </div>
            </div>
          </div>
          {hasReports ? (
            <button
              type="button"
              // Own stop-propagation so expanding doesn't also select.
              onClick={(e) => {
                e.stopPropagation();
                toggle(node.id);
              }}
              aria-label={
                expanded
                  ? `Collapse ${node.name}'s reports`
                  : `Expand ${node.name}'s ${String(node.directReportCount)} reports`
              }
              className="absolute -bottom-3 left-1/2 z-10 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-surface text-content-muted shadow-sm transition-colors hover:text-content"
            >
              <ChevronRight
                className={cn('h-3.5 w-3.5 transition-transform', expanded ? 'rotate-90' : '')}
                aria-hidden
              />
              <span className="sr-only tabular">{node.directReportCount}</span>
            </button>
          ) : null}
        </div>
      </div>

      {hasReports && expanded ? (
        <>
          {/* Connector from parent down into the children row. */}
          <span className="h-6 w-px bg-border" aria-hidden />
          <ul role="group" className="flex items-start gap-6">
            {node.reports.map((child, i) => (
              <div key={child.id} className="relative flex flex-col items-center">
                {/* Horizontal rail across siblings; trimmed at the two ends. */}
                {node.reports.length > 1 ? (
                  <span
                    className={cn(
                      'absolute top-0 h-px bg-border',
                      i === 0
                        ? 'left-1/2 right-0'
                        : i === node.reports.length - 1
                          ? 'left-0 right-1/2'
                          : 'inset-x-0',
                    )}
                    aria-hidden
                  />
                ) : null}
                <span className="h-6 w-px bg-border" aria-hidden />
                <TreeNode node={child} />
              </div>
            ))}
          </ul>
        </>
      ) : null}
    </li>
  );
}

function Avatar({ node }: { node: OrgTreeNode }): React.JSX.Element {
  if (node.profileImage !== null && node.profileImage.length > 0) {
    // Plain <img>: an arbitrary external URL, same reasoning as
    // profile-image-field.tsx — next/image would need a remote-host allowlist.
    return (
      <img src={node.profileImage} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
    );
  }
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-xs font-medium text-content-muted"
      aria-hidden
    >
      {initialsOf(node.name)}
    </div>
  );
}
