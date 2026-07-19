import type { Metadata } from 'next';
import { DashboardView } from '@/components/dashboard/dashboard-view';

export const metadata: Metadata = { title: 'Dashboard · Playstack' };

/** Server Component shell; the charts and stats are the client boundary. */
export default function DashboardPage(): React.JSX.Element {
  return <DashboardView />;
}
