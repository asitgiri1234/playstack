import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { Providers } from '@/lib/providers';
import './globals.css';

/**
 * Inter for UI, JetBrains Mono for numeric data (codes, salaries, dates,
 * counts). Self-hosted at build time via next/font — no layout shift, no
 * external request at runtime. The `--font-*` CSS vars are what globals.css and
 * tailwind resolve `font-sans` / `font-mono` (and `.tabular`) against.
 */
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
  weight: ['400', '500'],
});

export const metadata: Metadata = {
  title: 'Playstack',
  description: 'Employee management, done with care.',
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
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-bg font-sans text-base text-content antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
