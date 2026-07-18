'use client';

import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { selfUpdateEmployeeSchema, type SelfUpdateEmployeeInput } from '@playstack/shared';
import { useAuth } from '@/lib/auth-context';
import { useEmployee, useUpdateSelf } from '@/hooks/use-employees';
import { applyApiErrorToForm } from '@/lib/form-errors';
import { formatDate, formatRole, formatSalary } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { RoleBadge, StatusBadge } from '@/components/ui/badge';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { ProfileImageField } from '@/components/employees/profile-image-field';

export function ProfileView(): React.JSX.Element {
  const { user } = useAuth();
  const { data: employee, isLoading, isError, refetch } = useEmployee(user?.id ?? '');
  const updateSelf = useUpdateSelf();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<SelfUpdateEmployeeInput>({
    /**
     * selfUpdateEmployeeSchema — phone + profileImage only. Exactly
     * WRITABLE_FIELDS.EMPLOYEE, imported rather than re-listed here, so the
     * form cannot drift from the rule the API enforces.
     */
    resolver: zodResolver(selfUpdateEmployeeSchema),
    values: {
      phone: employee?.phone ?? '',
      profileImage: employee?.profileImage ?? null,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await updateSelf.mutateAsync(values);
      toast.success('Profile updated');
    } catch (error) {
      const message = applyApiErrorToForm(error, setError, ['phone', 'profileImage']);
      setFormError(message);
    }
  });

  if (isLoading) return <Skeleton className="h-96 w-full rounded-lg" />;
  if (isError || employee === undefined) {
    return (
      <ErrorState description="We could not load your profile." onRetry={() => void refetch()} />
    );
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={onSubmit}
        noValidate
        className="space-y-4 rounded-lg border border-border bg-surface p-6"
      >
        <h2 className="text-sm font-medium uppercase tracking-wide text-content-subtle">
          Editable details
        </h2>

        {formError !== null ? (
          <div
            role="alert"
            className="rounded-sm border border-danger-500/30 bg-danger-50 px-3 py-2 text-sm text-danger-700"
          >
            {formError}
          </div>
        ) : null}

        <Field label="Phone" error={errors.phone?.message} hint="E.164 format, e.g. +919876543210">
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type="tel"
              aria-describedby={describedBy}
              invalid={invalid}
              {...register('phone')}
            />
          )}
        </Field>

        <Controller
          control={control}
          name="profileImage"
          render={({ field }) => (
            <ProfileImageField
              value={field.value ?? null}
              onChange={field.onChange}
              disabled={false}
              error={errors.profileImage?.message}
            />
          )}
        />

        <div className="flex justify-end pt-2">
          <Button type="submit" variant="primary" isLoading={isSubmitting} disabled={!isDirty}>
            Save changes
          </Button>
        </div>
      </form>

      {/*
        Read-only, and visibly so. These are decided ABOUT an employee, not by
        them — WRITABLE_FIELDS.EMPLOYEE is exactly ['phone', 'profileImage'].
        Rendering them as disabled inputs would imply they are almost editable;
        a definition list says plainly that this is a record, not a form.

        `salary` is present here only because this is the employee's OWN record
        — canReadField lets you read your own. On anyone else's it is omitted.
      */}
      <section className="rounded-lg border border-border bg-surface p-6">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-content-subtle">
          Employment record
        </h2>
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <Detail label="Employee code" value={employee.employeeCode} tabular />
          <Detail label="Full name" value={employee.name} />
          <Detail label="Email" value={employee.email} />
          <Detail label="Department" value={employee.department} />
          <Detail label="Designation" value={employee.designation} />
          <Detail label="Salary" value={formatSalary(employee.salary)} tabular />
          <Detail label="Joined" value={formatDate(employee.joiningDate)} tabular />
          <Detail label="Role" value={<RoleBadge role={employee.role} />} />
          <Detail label="Status" value={<StatusBadge status={employee.status} />} />
        </dl>
        <p className="mt-5 border-t border-border pt-4 text-sm text-content-muted">
          Your {formatRole(employee.role).toLowerCase()} details are maintained by HR. Contact them
          to request a change.
        </p>
      </section>
    </div>
  );
}

function Detail({
  label,
  value,
  tabular = false,
}: {
  label: string;
  value: React.ReactNode;
  tabular?: boolean;
}): React.JSX.Element {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-content-subtle">{label}</dt>
      <dd className={`mt-1 text-base text-content ${tabular ? 'tabular' : ''}`}>{value}</dd>
    </div>
  );
}
