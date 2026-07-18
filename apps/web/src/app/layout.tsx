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
    <html lang="en">
      <body className="min-h-screen bg-bg font-sans text-base text-content antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
