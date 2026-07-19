'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Pencil, Users, X } from 'lucide-react';
import type { OrgTreeNode } from '@playstack/shared';
import { usePermission } from '@/lib/auth-context';
import { useAssignManager } from '@/hooks/use-org-tree';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatSalary, initialsOf } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { RoleBadge, StatusBadge } from '@/components/ui/badge';
import { ManagerCombobox } from '@/components/employees/manager-combobox';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Slide-over detail for a tree node, with (for SUPER_ADMIN) manager
 * reassignment. Traps focus and closes on Escape, like the Dialog primitive —
 * a drawer that leaks focus to the tree behind it is a keyboard trap.
 */
export function NodeDetailDrawer({
  node,
  onClose,
}: {
  node: OrgTreeNode | null;
  onClose: () => void;
}): React.JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const canReassign = usePermission('MANAGER:ASSIGN');

  useEffect(() => {
    if (node === null) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = panel?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (items === undefined || items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (first === undefined || last === undefined) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused.current?.focus();
    };
  }, [node, onClose]);

  if (node === null) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-overlay" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${node.name} details`}
        className="absolute right-0 top-0 flex h-full w-full max-w-sm flex-col border-l border-border bg-surface-raised shadow-lg"
      >
        <div className="flex items-start justify-between border-b border-border p-5">
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-sunken text-sm font-medium text-content-muted"
              aria-hidden
            >
              {initialsOf(node.name)}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-content">{node.name}</h2>
              <p className="tabular text-sm text-content-subtle">{node.employeeCode}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-sm p-1 text-content-muted hover:bg-surface-hover"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <div className="flex flex-wrap gap-2">
            <RoleBadge role={node.role} />
            <StatusBadge status={node.status} />
          </div>

          <dl className="space-y-3">
            <Detail label="Designation" value={node.designation} />
            <Detail label="Department" value={node.department} />
            <Detail label="Email" value={node.email} />
            <Detail label="Direct reports" value={String(node.directReportCount)} tabular />
            <Detail label="Total in subtree" value={String(node.totalDescendantCount)} tabular />
            {/* Only shown when the API included it — an EMPLOYEE viewing the tree
                never receives another person's salary (Phase 3 strips it). */}
            {node.salary !== undefined ? (
              <Detail label="Salary" value={formatSalary(node.salary)} tabular />
            ) : null}
          </dl>

          {canReassign ? <ReassignManager node={node} onDone={onClose} /> : null}
        </div>

        <div className="flex gap-2 border-t border-border p-5">
          <Link
            href={`/employees?managerId=${node.id}`}
            className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-sm border border-border-strong bg-surface text-base font-medium text-content hover:bg-surface-hover"
          >
            <Users className="h-3.5 w-3.5" aria-hidden />
            View reportees
          </Link>
          {/* Reuses the Phase 4 edit form; the route itself gates by permission. */}
          <EditLink node={node} />
        </div>
      </div>
    </div>
  );
}

function EditLink({ node }: { node: OrgTreeNode }): React.JSX.Element | null {
  const canEdit = usePermission('EMPLOYEE:UPDATE_ANY');
  if (!canEdit) return null;
  return (
    <Link
      href={`/employees/${node.id}/edit`}
      className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-sm bg-primary text-base font-medium text-content-inverted hover:bg-primary-hover"
    >
      <Pencil className="h-3.5 w-3.5" aria-hidden />
      Edit
    </Link>
  );
}

function ReassignManager({
  node,
  onDone,
}: {
  node: OrgTreeNode;
  onDone: () => void;
}): React.JSX.Element {
  const [managerId, setManagerId] = useState<string | null>(node.managerId);
  const [error, setError] = useState<string | null>(null);
  const assign = useAssignManager();

  const changed = managerId !== node.managerId;

  const submit = async (): Promise<void> => {
    setError(null);
    try {
      await assign.mutateAsync({ id: node.id, managerId });
      onDone();
    } catch (err) {
      /**
       * The SERVER owns cycle prevention (Phase 3: it re-checks inside a
       * Serializable transaction). We do not reimplement the check here — a
       * client walking a tree it fetched seconds ago can be wrong. We just
       * surface the server's 409 ("would create a cycle") inline on this field.
       */
      setError(err instanceof ApiError ? err.message : 'Could not reassign. Please try again.');
    }
  };

  return (
    <div className="space-y-2 border-t border-border pt-5">
      <label className="block text-sm font-medium text-content" id={`reassign-${node.id}`}>
        Reassign manager
      </label>
      <ManagerCombobox
        value={managerId}
        onChange={(id) => {
          setManagerId(id);
          setError(null);
        }}
        excludeId={node.id}
        invalid={error !== null}
        describedBy={error !== null ? `reassign-err-${node.id}` : undefined}
      />
      {error !== null ? (
        <p id={`reassign-err-${node.id}`} role="alert" className="text-xs text-danger-text">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end pt-1">
        <Button
          size="sm"
          variant="primary"
          disabled={!changed}
          isLoading={assign.isPending}
          onClick={() => void submit()}
        >
          Save manager
        </Button>
      </div>
    </div>
  );
}

function Detail({
  label,
  value,
  tabular = false,
}: {
  label: string;
  value: string;
  tabular?: boolean;
}): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-sm text-content-subtle">{label}</dt>
      <dd className={cn('text-base text-content', tabular && 'tabular')}>{value}</dd>
    </div>
  );
}
