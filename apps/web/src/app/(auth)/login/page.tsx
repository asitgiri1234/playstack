import { Suspense } from 'react';
import type { Metadata } from 'next';
import { LoginForm } from '@/components/auth/login-form';

export const metadata: Metadata = { title: 'Sign in · Playstack' };

/**
 * Server Component shell. Only the form itself is interactive, so only the form
 * is a client component.
 */
export default function LoginPage(): React.JSX.Element {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-content-inverted">
            <span className="text-md font-semibold">P</span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-content">
            Sign in to Playstack
          </h1>
          <p className="mt-1.5 text-base text-content-muted">
            Employee management for your organisation
          </p>
        </div>

        <div className="rounded-lg border border-border bg-surface-raised p-6 shadow-sm">
          {/* useSearchParams needs a Suspense boundary in the App Router. */}
          <Suspense fallback={<div className="h-64" />}>
            <LoginForm />
          </Suspense>
        </div>

        <p className="mt-6 text-center text-xs text-content-subtle">
          Protected by rate limiting. Contact your administrator if you cannot sign in.
        </p>
      </div>
    </main>
  );
}
