import { Skeleton } from '@/components/ui/states';

/**
 * A skeleton SHAPED like a tree — one root card over a row of child cards, with
 * connectors — rather than a generic grey block. The loading state should
 * resemble what is coming.
 */
export function OrgTreeSkeleton(): React.JSX.Element {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-8 w-44" />
      </div>
      <div className="rounded-lg border border-border bg-surface-sunken/40 p-8">
        <div className="flex flex-col items-center gap-6">
          <Skeleton className="h-[76px] w-56 rounded-lg" />
          <span className="h-6 w-px bg-border" aria-hidden />
          <div className="flex gap-6">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[76px] w-56 rounded-lg" />
            ))}
          </div>
        </div>
        <span className="sr-only">Loading organization chart…</span>
      </div>
    </div>
  );
}
