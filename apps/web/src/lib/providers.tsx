'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AuthProvider } from './auth-context';
import { ApiError } from './api';

export function Providers({ children }: { children: ReactNode }): React.JSX.Element {
  // Created in state, not at module scope: a module-level client would be
  // shared across requests during SSR and leak one user's cache into another's.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: (failureCount, error) => {
              // Never retry an auth/permission failure — the answer will not
              // change, and hammering /login-adjacent endpoints is how you trip
              // the rate limiter. The client already retries 401 exactly once
              // via the refresh flow in api.ts.
              if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
                return false;
              }
              return failureCount < 2;
            },
            refetchOnWindowFocus: false,
          },
          mutations: { retry: false },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'var(--surface-raised)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
            },
          }}
        />
      </AuthProvider>
    </QueryClientProvider>
  );
}
