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
      <div className="w-full max-w-[360px]">
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="mb-5 flex h-9 w-9 items-center justify-center rounded-md bg-primary text-content-inverted">
            <span className="text-sm font-bold">P</span>
          </div>
          <h1 className="text-xl font-semibold tracking-display text-content">
            Sign in to Playstack
          </h1>
          <p className="mt-1.5 text-sm text-content-muted">Employee management, done with care.</p>
        </div>

        <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
          {/* useSearchParams needs a Suspense boundary in the App Router. */}
          <Suspense fallback={<div className="h-64" />}>
            <LoginForm />
          </Suspense>
        </div>

        <p className="mt-5 text-center text-xs text-content-subtle">
          Protected by rate limiting. Contact your administrator if you cannot sign in.
        </p>
      </div>
    </main>
  );
}
