'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PaginationMeta } from '@playstack/shared';
import { Button } from '@/components/ui/button';

const PAGE_SIZES = [10, 20, 50];

export function EmployeePagination({
  pagination,
  onPageChange,
  onLimitChange,
}: {
  pagination: PaginationMeta;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
}): React.JSX.Element {
  const { page, limit, total, totalPages, hasNext, hasPrev } = pagination;

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-3 py-2.5">
      <div className="flex items-center gap-3">
        <p className="tabular text-sm text-content-muted">
          {total === 0 ? (
            'No results'
          ) : (
            <>
              <span className="font-medium text-content">
                {from}–{to}
              </span>{' '}
              of <span className="font-medium text-content">{total}</span>
            </>
          )}
        </p>

        <label className="flex items-center gap-1.5 text-sm text-content-muted">
          <span className="sr-only sm:not-sr-only">Rows</span>
          <select
            value={limit}
            onChange={(e) => onLimitChange(Number(e.target.value))}
            aria-label="Rows per page"
            className="h-7 rounded-sm border border-border-strong bg-surface px-1.5 text-sm text-content"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center gap-2">
        <span className="tabular text-sm text-content-muted">
          Page {page} of {Math.max(totalPages, 1)}
        </span>
        {/* hasPrev/hasNext come from the API — the client does not recompute
            bounds it might disagree with. */}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={!hasPrev}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={!hasNext}
          aria-label="Next page"
        >
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
