'use client';

import { useState, type ReactNode } from 'react';
import { Sidebar, SidebarDrawer } from './sidebar';
import { Topbar } from './topbar';

/** Holds only the drawer's open state — extracted so the layout stays a Server Component. */
export function DashboardShell({ children }: { children: ReactNode }): React.JSX.Element {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <SidebarDrawer open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenNav={() => setNavOpen(true)} />
        <main className="flex-1 px-4 py-6 md:px-6 md:py-8">{children}</main>
      </div>
    </div>
  );
}
