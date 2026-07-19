'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Network, Users, UserCircle, X } from 'lucide-react';
import { can, type Permission } from '@playstack/shared';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: typeof Users;
  /** Omitted = visible to everyone who is signed in. */
  permission?: Permission;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'DASHBOARD:READ' },
  { href: '/employees', label: 'Employees', icon: Users, permission: 'EMPLOYEE:READ_ALL' },
  // ORG:READ_TREE is held by every role, so the org chart shows for everyone —
  // the tree strips salary per-actor server-side (Phase 3).
  { href: '/organization', label: 'Organization', icon: Network, permission: 'ORG:READ_TREE' },
  { href: '/profile', label: 'My Profile', icon: UserCircle },
];

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }): React.JSX.Element {
  const pathname = usePathname();
  const { user } = useAuth();

  /**
   * Links are FILTERED OUT, not disabled.
   *
   * A greyed-out "Employees" link tells an employee there is a roster they are
   * not allowed to see — it advertises the shape of the system and invites them
   * to poke at the URL. Absence says nothing. (They would get a 403 anyway; the
   * point is not to dangle it.)
   *
   * can() is the shared matrix — the same function authorize() calls server-side.
   */
  const visible = NAV_ITEMS.filter(
    (item) => item.permission === undefined || (user !== null && can(user.role, item.permission)),
  );

  return (
    <nav className="space-y-0.5" aria-label="Main">
      {visible.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            // Spread rather than pass undefined — next/link types onClick as
            // required-if-present under exactOptionalPropertyTypes.
            {...(onNavigate !== undefined ? { onClick: onNavigate } : {})}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2.5 rounded-sm px-3 py-2 text-base font-medium transition-colors',
              isActive
                ? 'bg-primary-subtle text-primary-text'
                : 'text-content-muted hover:bg-surface-hover hover:text-content',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand(): React.JSX.Element {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-7 w-7 items-center justify-center rounded-sm bg-primary text-content-inverted">
        <span className="text-sm font-semibold">P</span>
      </div>
      <span className="text-md font-semibold tracking-tight text-content">Playstack</span>
    </div>
  );
}

/** Static sidebar, md and up. */
export function Sidebar(): React.JSX.Element {
  return (
    <aside className="hidden w-60 shrink-0 border-r border-border bg-surface md:flex md:flex-col">
      <div className="flex h-14 items-center border-b border-border px-4">
        <Brand />
      </div>
      <div className="flex-1 p-3">
        <SidebarNav />
      </div>
    </aside>
  );
}

/** Drawer, below md. */
export function SidebarDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): React.JSX.Element | null {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 md:hidden">
      <div className="absolute inset-0 bg-overlay" onClick={onClose} aria-hidden />
      <aside className="relative flex h-full w-64 flex-col border-r border-border bg-surface">
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          <Brand />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="rounded-sm p-1 text-content-muted hover:bg-surface-hover"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="flex-1 p-3">
          <SidebarNav onNavigate={onClose} />
        </div>
      </aside>
    </div>
  );
}
