'use client';

import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { DEPARTMENTS, ROLES, STATUSES } from '@playstack/shared';
import { formatRole } from '@/lib/format';
import { MultiSelect } from '@/components/ui/multi-select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import type { EmployeeFilters } from '@/hooks/use-employee-filters';

interface Props {
  filters: EmployeeFilters;
  hasActiveFilters: boolean;
  setFilter: (patch: Partial<EmployeeFilters>) => void;
  clearFilters: () => void;
}

export function EmployeeFiltersBar({
  filters,
  hasActiveFilters,
  setFilter,
  clearFilters,
}: Props): React.JSX.Element {
  // Local mirror of the search box so typing stays responsive while the URL
  // (and the request) lag behind by the debounce.
  const [searchDraft, setSearchDraft] = useState(filters.search);

  // Keep in step when the URL changes from elsewhere — back/forward, or Clear.
  useEffect(() => {
    setSearchDraft(filters.search);
  }, [filters.search]);

  useEffect(() => {
    if (searchDraft === filters.search) return;
    /**
     * 300ms debounce. Every keystroke is a server request otherwise — "Priya"
     * is five queries and five history entries, and the responses can land out
     * of order so the table shows results for "Pri" after "Priya".
     */
    const timer = setTimeout(() => setFilter({ search: searchDraft }), 300);
    return () => clearTimeout(timer);
  }, [searchDraft, filters.search, setFilter]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-content-subtle"
          aria-hidden
        />
        <Input
          type="search"
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          placeholder="Search name or email…"
          aria-label="Search employees by name or email"
          className="pl-9"
        />
      </div>

      <MultiSelect
        label="Department"
        options={DEPARTMENTS.map((d) => ({ value: d, label: d }))}
        selected={filters.department}
        onChange={(department) => setFilter({ department })}
      />

      <MultiSelect
        label="Role"
        options={ROLES.map((r) => ({ value: r, label: formatRole(r) }))}
        selected={filters.role}
        onChange={(role) => setFilter({ role })}
      />

      {/* Status is single-select: the API takes one value, and ACTIVE+INACTIVE
          together is just "no filter". */}
      <MultiSelect
        label="Status"
        options={STATUSES.map((s) => ({ value: s, label: s === 'ACTIVE' ? 'Active' : 'Inactive' }))}
        selected={filters.status.length > 0 ? [filters.status] : []}
        onChange={(next) => setFilter({ status: next[next.length - 1] ?? '' })}
      />

      {hasActiveFilters ? (
        <Button variant="ghost" size="sm" onClick={clearFilters}>
          <X className="h-3.5 w-3.5" aria-hidden />
          Clear
        </Button>
      ) : null}
    </div>
  );
}
