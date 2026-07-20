'use client';

import { useState } from 'react';
import { LogOut, Menu } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { initialsOf } from '@/lib/format';
import { RoleBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from './theme-toggle';

export function Topbar({ onOpenNav }: { onOpenNav: () => void }): React.JSX.Element {
  const { user, logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async (): Promise<void> => {
    setIsLoggingOut(true);
    try {
      // Awaited: logout revokes the refresh token server-side (Phase 1). Only
      // clearing client state would leave a live session behind.
      await logout();
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-surface px-4 md:px-6">
      <button
        type="button"
        onClick={onOpenNav}
        aria-label="Open navigation"
        className="rounded-sm p-1.5 text-content-muted hover:bg-surface-hover md:hidden"
      >
        <Menu className="h-4 w-4" aria-hidden />
      </button>

      <div className="ml-auto flex items-center gap-2.5">
        {user !== null ? (
          <>
            <div className="hidden items-center gap-2 sm:flex">
              <div
                className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-sunken text-[10px] font-semibold text-content-muted"
                aria-hidden
              >
                {initialsOf(user.name)}
              </div>
              <div className="leading-tight">
                <div className="text-sm font-medium text-content">{user.name}</div>
                <div className="tabular text-[11px] text-content-subtle">{user.employeeCode}</div>
              </div>
            </div>
            <RoleBadge role={user.role} />
          </>
        ) : null}
        <ThemeToggle />
        <div className="h-4 w-px bg-border" aria-hidden />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void handleLogout()}
          isLoading={isLoggingOut}
          aria-label="Sign out"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden />
          <span className="hidden sm:inline">Sign out</span>
        </Button>
      </div>
    </header>
  );
}
