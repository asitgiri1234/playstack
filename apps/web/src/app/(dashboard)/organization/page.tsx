import type { Metadata } from 'next';
import { OrgTreeView } from '@/components/organization/org-tree-view';

export const metadata: Metadata = { title: 'Organization · Playstack' };

/** Server Component shell; the interactive tree is the client boundary. */
export default function OrganizationPage(): React.JSX.Element {
  return <OrgTreeView />;
}
