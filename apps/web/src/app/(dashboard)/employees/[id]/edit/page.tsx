import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';
import { EditEmployeeView } from '@/components/employees/edit-employee-view';

export const metadata: Metadata = { title: 'Edit employee · Playstack' };

/** Next 15: params is a Promise in Server Components. */
export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.JSX.Element> {
  const { id } = await params;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/employees"
          className="inline-flex items-center gap-1.5 text-sm text-content-muted hover:text-content"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Employees
        </Link>
      </div>
      <EditEmployeeView id={id} />
    </div>
  );
}
