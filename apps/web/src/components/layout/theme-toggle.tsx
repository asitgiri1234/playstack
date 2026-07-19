'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

const OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'dark', label: 'Dark', icon: Moon },
] as const;

/**
 * Three-way theme control: Light / System / Dark.
 *
 * System is a first-class choice, not just the default — a user who wants to
 * follow their OS should be able to return to that after toggling, which a bare
 * light/dark switch cannot express.
 */
export function ThemeToggle(): React.JSX.Element {
  const { theme, setTheme } = useTheme();
  // next-themes only knows the resolved theme after mount (it reads
  // localStorage / the OS). Rendering the active state during SSR would
  // hydration-mismatch, so hold a neutral placeholder until mounted.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="inline-flex items-center rounded-sm border border-border bg-surface p-0.5"
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = mounted && theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-[5px] transition-colors',
              active ? 'bg-surface-sunken text-content' : 'text-content-subtle hover:text-content',
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
