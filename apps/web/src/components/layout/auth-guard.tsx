'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Skeleton } from '@/components/ui/states';

/**
 * Client-side gate for the dashboard group.
 *
 * Renders a SKELETON while isLoading — never the login screen, and never the
 * dashboard. On a page refresh the token is gone from memory and the rehydrate
 * (refresh cookie → /me) takes a round trip; rendering "logged out" during that
 * window flashes a login form at someone who is perfectly authenticated, and
 * rendering the dashboard flashes an empty shell that then populates. The
 * skeleton is the honest answer to "we don't know yet".
 *
 * UX only. Every byte on the page still comes from an API that authenticates
 * each request independently.
 */
export function AuthGuard({ children }: { children: ReactNode }): React.JSX.Element | null {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user === null) router.replace('/login');
  }, [isLoading, user, router]);

  if (isLoading) return <DashboardSkeleton />;
  // Redirect is in flight — render nothing rather than a flash of login.
  if (user === null) return null;

  return <>{children}</>;
}

function DashboardSkeleton(): React.JSX.Element {
  return (
    <div className="flex min-h-screen">
      <div className="hidden w-60 shrink-0 border-r border-border bg-surface p-4 md:block">
        <Skeleton className="h-8 w-32" />
        <div className="mt-8 space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      </div>
      <div className="flex-1">
        <div className="flex h-14 items-center justify-between border-b border-border bg-surface px-6">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
        <div className="space-y-3 p-6">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    </div>
  );
}
