'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { useDirectory } from '@/hooks/use-directory';
import { cn } from '@/lib/utils';
import { inputStyles } from '@/components/ui/field';

/**
 * Searchable manager picker.
 *
 * CYCLE PREVENTION IS NOT DONE HERE. This excludes only the obvious case —
 * yourself — because offering "report to yourself" is nonsense in a dropdown.
 * It deliberately does NOT walk the tree to hide descendants:
 *
 *   - The server already refuses cycles authoritatively, inside a Serializable
 *     transaction (Phase 3). It has to: two admins reassigning concurrently can
 *     each pass any client-side check and still form a cycle together.
 *   - A second implementation here would be a second thing to keep correct, and
 *     the two would drift. When they disagree the UI is wrong, because it is
 *     reasoning about a tree it fetched some seconds ago.
 *
 * So: let the user pick, let the server rule, and surface its 409 as a form
 * error on this field. Being briefly wrong and then told so is better than
 * being confidently wrong in two places.
 *
 * Soft-deleted employees are already absent — the API omits them from the list.
 */
export function ManagerCombobox({
  value,
  onChange,
  excludeId,
  disabled = false,
  invalid = false,
  id,
  describedBy,
}: {
  value: string | null;
  onChange: (managerId: string | null) => void;
  excludeId?: string | undefined;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  describedBy?: string | undefined;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const { employees, isLoading } = useDirectory(!disabled);

  const options = useMemo(() => {
    const term = query.trim().toLowerCase();
    return employees
      .filter((e) => e.id !== excludeId)
      .filter(
        (e) =>
          term.length === 0 ||
          e.name.toLowerCase().includes(term) ||
          e.employeeCode.toLowerCase().includes(term),
      )
      .slice(0, 50);
  }, [employees, excludeId, query]);

  const selected = employees.find((e) => e.id === value);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        className={cn(
          inputStyles,
          'flex h-9 items-center justify-between text-left',
          invalid ? 'border-danger-500' : 'border-border-strong',
        )}
      >
        <span className={cn(selected === undefined ? 'text-content-subtle' : 'text-content')}>
          {selected !== undefined
            ? `${selected.name} · ${selected.employeeCode}`
            : value !== null
              ? 'Unknown employee'
              : 'No manager (root of the org)'}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-content-subtle" aria-hidden />
      </button>

      {open && !disabled ? (
        <div className="absolute z-30 mt-1 w-full rounded-sm border border-border bg-surface-raised shadow-md">
          <div className="border-b border-border p-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or code…"
              aria-label="Search for a manager"
              className="ring-focus h-8 w-full rounded-sm border border-border-strong bg-surface px-2 text-sm"
            />
          </div>

          <ul role="listbox" aria-label="Managers" className="max-h-56 overflow-auto py-1">
            <li>
              <button
                type="button"
                role="option"
                aria-selected={value === null}
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm text-content-muted hover:bg-surface-hover"
              >
                <span className="flex items-center gap-1.5">
                  <X className="h-3 w-3" aria-hidden />
                  No manager (root)
                </span>
                {value === null ? <Check className="h-3.5 w-3.5 text-primary" aria-hidden /> : null}
              </button>
            </li>

            {isLoading ? (
              <li className="px-3 py-2 text-sm text-content-subtle">Loading…</li>
            ) : options.length === 0 ? (
              <li className="px-3 py-2 text-sm text-content-subtle">No matches</li>
            ) : (
              options.map((employee) => (
                <li key={employee.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={value === employee.id}
                    onClick={() => {
                      onChange(employee.id);
                      setOpen(false);
                    }}
                    className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-surface-hover"
                  >
                    <span>
                      <span className="text-content">{employee.name}</span>
                      <span className="tabular ml-1.5 text-xs text-content-subtle">
                        {employee.employeeCode}
                      </span>
                    </span>
                    {value === employee.id ? (
                      <Check className="h-3.5 w-3.5 text-primary" aria-hidden />
                    ) : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
