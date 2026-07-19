'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
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
      {/*
        next-themes writes class="dark" on <html>. `defaultTheme="system"` +
        `enableSystem` honours prefers-color-scheme on first visit; once the user
        toggles, the choice is persisted to localStorage and wins. The library
        injects a tiny blocking script (paired with suppressHydrationWarning on
        <html> in layout.tsx) that sets the class BEFORE first paint, so there is
        no flash of the wrong theme. disableTransitionOnChange suppresses the
        global colour transition for the one frame of the swap, so the toggle
        doesn't smear.
      */}
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <AuthProvider>
          {children}
          <Toaster
            position="bottom-right"
            // Follows the app theme rather than sonner's own light default.
            theme="system"
            toastOptions={{
              style: {
                background: 'var(--surface-raised)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
              },
            }}
          />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
