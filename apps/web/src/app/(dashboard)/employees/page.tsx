import { Suspense } from 'react';
import type { Metadata } from 'next';
import { EmployeesView } from '@/components/employees/employees-view';
import { EmployeeTableSkeleton } from '@/components/employees/employee-table';

export const metadata: Metadata = { title: 'Employees · Playstack' };

/** Server Component shell; the interactive view reads the URL and fetches. */
export default function EmployeesPage(): React.JSX.Element {
  return (
    // useSearchParams (URL-as-state) requires a Suspense boundary here.
    <Suspense fallback={<EmployeeTableSkeleton />}>
      <EmployeesView />
    </Suspense>
  );
}
