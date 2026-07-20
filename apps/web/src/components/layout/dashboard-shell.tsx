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
      <div className="flex min-w-0 flex-1 flex-col bg-bg">
        <Topbar onOpenNav={() => setNavOpen(true)} />
        <main className="mx-auto w-full max-w-[1200px] flex-1 px-5 py-8 md:px-8 md:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
