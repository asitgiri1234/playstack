import type { ReactNode } from 'react';
import { AuthGuard } from '@/components/layout/auth-guard';
import { DashboardShell } from '@/components/layout/dashboard-shell';

/** Server Component. The guard and shell below are the client boundary. */
export default function DashboardLayout({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <AuthGuard>
      <DashboardShell>{children}</DashboardShell>
    </AuthGuard>
  );
}
