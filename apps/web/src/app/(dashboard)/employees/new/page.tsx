import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';
import { EmployeeForm } from '@/components/employees/employee-form';

export const metadata: Metadata = { title: 'Add employee · Playstack' };

export default function NewEmployeePage(): React.JSX.Element {
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
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-content">Add employee</h1>
        <p className="mt-1 text-base text-content-muted">
          A temporary password is generated and shown once after creation.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-surface p-6">
        <EmployeeForm />
      </div>
    </div>
  );
}
