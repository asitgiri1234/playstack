'use client';

import { useId, type ReactNode } from 'react';
import { Skeleton } from '@/components/ui/states';

interface Datum {
  label: string;
  value: number;
  color?: string;
}

/**
 * Wraps every chart with a visible title and — the part that matters for
 * accessibility — a screen-reader-only data TABLE of the same numbers.
 *
 * A chart is a picture, and a picture is invisible to a screen reader: recharts
 * renders SVG paths with no inherent meaning. So each chart ships its figures
 * as a real <table> in an sr-only region, and the SVG is marked aria-hidden.
 * The sighted user sees the chart; the screen-reader user reads the table; both
 * get the same data. A chart with no text alternative is simply inaccessible.
 */
export function ChartCard({
  title,
  data,
  isLoading,
  isEmpty,
  emptyLabel = 'No data to display.',
  valueLabel = 'Count',
  children,
}: {
  title: string;
  data: Datum[];
  isLoading: boolean;
  isEmpty: boolean;
  emptyLabel?: string;
  valueLabel?: string;
  children: ReactNode;
}): React.JSX.Element {
  const tableId = useId();

  return (
    <section
      aria-labelledby={`${tableId}-title`}
      className="flex flex-col rounded-lg border border-border bg-surface p-5"
    >
      <h3 id={`${tableId}-title`} className="text-md font-medium text-content">
        {title}
      </h3>

      <div className="mt-4 min-h-[220px] flex-1">
        {isLoading ? (
          // Per-chart loading, not one page spinner — each card resolves on its
          // own so the dashboard fills in progressively.
          <div className="flex h-[220px] items-end gap-3 px-2">
            {[60, 85, 45, 70, 55].map((h, i) => (
              <Skeleton key={i} className="flex-1 rounded-sm" style={{ height: `${String(h)}%` }} />
            ))}
          </div>
        ) : isEmpty ? (
          <div className="flex h-[220px] items-center justify-center text-center">
            <p className="text-base text-content-muted">{emptyLabel}</p>
          </div>
        ) : (
          <>
            {/* aria-hidden: the SVG carries no meaning for a screen reader; the
                table below is its accessible equivalent. */}
            <div aria-hidden>{children}</div>

            <table className="sr-only">
              <caption>{title}</caption>
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  <th scope="col">{valueLabel}</th>
                </tr>
              </thead>
              <tbody>
                {data.map((d) => (
                  <tr key={d.label}>
                    <th scope="row">{d.label}</th>
                    <td>{d.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </section>
  );
}
