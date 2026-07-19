import type { Metadata } from 'next';
import { Providers } from '@/lib/providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Playstack',
  description: 'Employee Management System',
};

/**
 * Root layout is a Server Component — it ships no JS of its own. Providers is
 * the single 'use client' boundary; everything static above it stays server-rendered.
 */
export default function RootLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    // suppressHydrationWarning: next-themes' pre-paint script sets class="dark"
    // on <html> before React hydrates, so the server-rendered markup and the
    // client's first render legitimately differ on this one attribute. Without
    // this, React would warn about it on every load. It suppresses the warning
    // for <html> only, not the whole tree.
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-bg font-sans text-base text-content antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
