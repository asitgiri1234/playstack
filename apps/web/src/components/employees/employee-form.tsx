'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Controller, useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  DEPARTMENTS,
  STATUSES,
  createEmployeeSchema,
  updateEmployeeSchema,
  type EmployeeDTO,
  type MutableEmployeeField,
  type Role,
} from '@playstack/shared';
import { useCreateEmployee, useUpdateEmployee } from '@/hooks/use-employees';
import { useFieldPermissions } from '@/hooks/use-field-permissions';
import { applyApiErrorToForm } from '@/lib/form-errors';
import { formatRole, toDateInputValue } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { ManagerCombobox } from './manager-combobox';
import { ProfileImageField } from './profile-image-field';

/** Every field this form can render — the allowlist form-errors maps against. */
const FORM_FIELDS: MutableEmployeeField[] = [
  'name',
  'email',
  'phone',
  'department',
  'designation',
  'salary',
  'joiningDate',
  'status',
  'role',
  'managerId',
  'profileImage',
];

interface FormValues {
  name: string;
  email: string;
  phone: string;
  department: string;
  designation: string;
  salary: string;
  joiningDate: string;
  status: string;
  role: string;
  managerId: string | null;
  profileImage: string | null;
}

export function EmployeeForm({ employee }: { employee?: EmployeeDTO }): React.JSX.Element {
  const router = useRouter();
  const isEdit = employee !== undefined;
  const [formError, setFormError] = useState<string | null>(null);

  const { canWrite, assignableRoles, isReadOnly } = useFieldPermissions(employee?.role);
  const createEmployee = useCreateEmployee();
  const updateEmployee = useUpdateEmployee(employee?.id ?? '');

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    /**
     * Schemas imported from shared — the exact rules the API enforces, not a
     * second copy.
     *
     * The cast is deliberate and narrow. These schemas TRANSFORM on parse
     * (`salary` → string, `joiningDate` → Date), so a schema's input type and
     * output type differ, and useForm takes a single TFieldValues. The DOM
     * holds strings, so FormValues describes the inputs; the parsed output is
     * what reaches onSubmit and is JSON-serialised, where a Date becomes an ISO
     * string that the API's z.coerce.date() parses straight back. Runtime is
     * correct; only the generic needs help.
     */
    resolver: zodResolver(
      isEdit ? updateEmployeeSchema : createEmployeeSchema,
    ) as unknown as Resolver<FormValues>,
    defaultValues: {
      name: employee?.name ?? '',
      email: employee?.email ?? '',
      phone: employee?.phone ?? '',
      department: employee?.department ?? DEPARTMENTS[0],
      designation: employee?.designation ?? '',
      salary: employee?.salary ?? '',
      joiningDate: toDateInputValue(employee?.joiningDate),
      status: employee?.status ?? 'ACTIVE',
      role: employee?.role ?? 'EMPLOYEE',
      managerId: employee?.managerId ?? null,
      profileImage: employee?.profileImage ?? null,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      if (isEdit) {
        // Send only what this actor may write. Anything else would be refused
        // by sanitizeFields with a 403 naming the field — correct, but a
        // pointless round trip for a value the form rendered read-only.
        const payload: Record<string, unknown> = {};
        for (const field of FORM_FIELDS) {
          if (!canWrite(field)) continue;
          payload[field] = values[field as keyof FormValues];
        }
        await updateEmployee.mutateAsync(payload);
        toast.success('Employee updated');
      } else {
        const result = await createEmployee.mutateAsync(values);
        toast.success('Employee created', {
          description:
            result.temporaryPassword !== undefined
              ? `Temporary password: ${result.temporaryPassword}`
              : undefined,
          // Shown once and never retrievable — the API only ever returns it on
          // creation, so give the admin time to copy it.
          duration: result.temporaryPassword !== undefined ? 30_000 : 4000,
        });
      }
      router.push('/employees');
    } catch (error) {
      const message = applyApiErrorToForm(error, setError, FORM_FIELDS);
      setFormError(message);
      if (message !== null) toast.error(message);
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      {isReadOnly ? (
        <div
          role="status"
          className="rounded-sm border border-border bg-surface-sunken px-3 py-2 text-sm text-content-muted"
        >
          You don&apos;t have permission to edit this record — fields are read-only.
        </div>
      ) : null}

      {formError !== null ? (
        <div
          role="alert"
          className="rounded-sm bg-danger-surface px-3 py-2 text-sm text-danger-text"
        >
          {formError}
        </div>
      ) : null}

      <Section title="Personal">
        <Field label="Full name" error={errors.name?.message} required>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              disabled={!canWrite('name')}
              {...register('name')}
            />
          )}
        </Field>

        <Field label="Email" error={errors.email?.message} required>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type="email"
              aria-describedby={describedBy}
              invalid={invalid}
              disabled={!canWrite('email')}
              {...register('email')}
            />
          )}
        </Field>

        <Field
          label="Phone"
          error={errors.phone?.message}
          hint="E.164 format, e.g. +919876543210"
          required
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type="tel"
              aria-describedby={describedBy}
              invalid={invalid}
              disabled={!canWrite('phone')}
              {...register('phone')}
            />
          )}
        </Field>

        <Controller
          control={control}
          name="profileImage"
          render={({ field }) => (
            <ProfileImageField
              value={field.value}
              onChange={field.onChange}
              disabled={!canWrite('profileImage')}
              error={errors.profileImage?.message}
            />
          )}
        />
      </Section>

      <Section title="Role & placement">
        <Field label="Department" error={errors.department?.message} required>
          {({ id, describedBy, invalid }) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              disabled={!canWrite('department')}
              {...register('department')}
            >
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="Designation" error={errors.designation?.message} required>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              disabled={!canWrite('designation')}
              {...register('designation')}
            />
          )}
        </Field>

        <Field label="Role" error={errors.role?.message}>
          {({ id, describedBy, invalid }) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              disabled={!canWrite('role')}
              {...register('role')}
            >
              {/* SUPER_ADMIN is absent for HR — canAssignRole filtered it out. */}
              {assignableRoles.map((role: Role) => (
                <option key={role} value={role}>
                  {formatRole(role)}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="Status" error={errors.status?.message}>
          {({ id, describedBy, invalid }) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              disabled={!canWrite('status')}
              {...register('status')}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s === 'ACTIVE' ? 'Active' : 'Inactive'}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field
          label="Manager"
          error={errors.managerId?.message}
          hint={canWrite('managerId') ? undefined : 'Only a Super Admin can reassign managers.'}
        >
          {({ id, describedBy, invalid }) => (
            <Controller
              control={control}
              name="managerId"
              render={({ field }) => (
                <ManagerCombobox
                  id={id}
                  describedBy={describedBy}
                  invalid={invalid}
                  value={field.value}
                  onChange={field.onChange}
                  excludeId={employee?.id}
                  disabled={!canWrite('managerId')}
                />
              )}
            />
          )}
        </Field>
      </Section>

      <Section title="Employment">
        <Field label="Salary (INR)" error={errors.salary?.message} required>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              inputMode="decimal"
              placeholder="1200000.00"
              className="tabular"
              aria-describedby={describedBy}
              invalid={invalid}
              disabled={!canWrite('salary')}
              {...register('salary')}
            />
          )}
        </Field>

        <Field label="Joining date" error={errors.joiningDate?.message} required>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type="date"
              className="tabular"
              aria-describedby={describedBy}
              invalid={invalid}
              disabled={!canWrite('joiningDate')}
              {...register('joiningDate')}
            />
          )}
        </Field>
      </Section>

      <div className="flex justify-end gap-2 border-t border-border pt-5">
        <Button type="button" variant="secondary" onClick={() => router.push('/employees')}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" isLoading={isSubmitting} disabled={isReadOnly}>
          {isEdit ? 'Save changes' : 'Create employee'}
        </Button>
      </div>
    </form>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <fieldset className="space-y-4">
      <legend className="mb-4 w-full border-b border-border pb-2 text-xs font-medium text-content-subtle">
        {title}
      </legend>
      <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}
