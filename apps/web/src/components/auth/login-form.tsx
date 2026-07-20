'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@playstack/shared';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';

export function LoginForm(): React.JSX.Element {
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    // The SAME schema the API validates with — imported, not reimplemented.
    // The user gets instant feedback; the server still re-parses every request,
    // because this copy runs on the attacker's machine.
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await login(values.email, values.password);
      // `from` is set by middleware when it bounced an unauthenticated user, so
      // signing in returns them where they were going, else /dashboard — whose
      // guard forwards an EMPLOYEE (no DASHBOARD:READ) on to /profile. One
      // default, correct for every role by delegation.
      const from = searchParams.get('from');
      router.replace(from !== null && from.startsWith('/') ? from : '/dashboard');
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) {
        setFormError(error.message);
        return;
      }
      /**
       * One message for every credential failure, mirroring the backend's
       * GENERIC_LOGIN_FAILURE. Distinguishing "no such user" from "wrong
       * password" here would undo the enumeration defence the API was careful
       * to build — the leak would just move to the client.
       */
      setFormError('Invalid email or password.');
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {formError !== null ? (
        <div
          role="alert"
          className="rounded-sm bg-danger-surface px-3 py-2 text-sm text-danger-text"
        >
          {formError}
        </div>
      ) : null}

      <Field label="Email" error={errors.email?.message} required>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            type="email"
            autoComplete="email"
            autoFocus
            placeholder="you@playstack.dev"
            aria-describedby={describedBy}
            invalid={invalid}
            {...register('email')}
          />
        )}
      </Field>

      <Field label="Password" error={errors.password?.message} required>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            type="password"
            autoComplete="current-password"
            aria-describedby={describedBy}
            invalid={invalid}
            {...register('password')}
          />
        )}
      </Field>

      <Button type="submit" variant="primary" className="w-full" isLoading={isSubmitting}>
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
