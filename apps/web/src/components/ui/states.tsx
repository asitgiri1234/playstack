import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';

export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}): React.JSX.Element {
  return <div className={cn('skeleton rounded-sm', className)} style={style} aria-hidden />;
}

/**
 * Empty state.
 *
 * `variant` matters: "no employees yet" and "no results for these filters" are
 * different problems with different fixes. Showing the first when the real
 * answer is the second makes a user think the database is empty when they have
 * simply typed a typo into search.
 */
export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      {icon !== undefined ? <div className="mb-4 text-content-subtle">{icon}</div> : null}
      <h3 className="text-sm font-medium text-content">{title}</h3>
      <p className="mt-1 max-w-xs text-sm leading-relaxed text-content-muted">{description}</p>
      {action !== undefined ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  description,
  onRetry,
}: {
  // `| undefined` explicitly: exactOptionalPropertyTypes distinguishes "absent"
  // from "present and undefined", and callers pass a computed value that may be
  // undefined.
  title?: string | undefined;
  description: string;
  onRetry: () => void;
}): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <h3 className="text-sm font-medium text-content">{title}</h3>
      <p className="mt-1 max-w-xs text-sm leading-relaxed text-content-muted">{description}</p>
      <Button variant="secondary" size="sm" className="mt-5" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
