'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Option {
  value: string;
  label: string;
}

/**
 * Checkbox dropdown for the repeatable filters the API accepts
 * (?department=Sales&department=Engineering).
 */
export function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const toggle = (value: string): void => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };

  const summary = selected.length === 0 ? label : `${label} · ${String(selected.length)}`;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          'inline-flex h-9 items-center gap-1.5 rounded-sm border px-2.5 text-sm transition-colors',
          selected.length > 0
            ? 'border-border-strong bg-primary-subtle text-primary-text'
            : 'border-border-strong bg-surface text-content-muted hover:bg-surface-hover hover:text-content',
        )}
      >
        {summary}
        <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden />
      </button>

      {open ? (
        <div
          role="listbox"
          aria-multiselectable
          aria-label={label}
          className="absolute left-0 z-20 mt-1.5 max-h-64 w-52 overflow-auto rounded-md border border-border bg-surface-raised p-1 shadow-md"
        >
          {options.map((option) => {
            const isSelected = selected.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => toggle(option.value)}
                className="flex w-full items-center justify-between rounded-sm px-2.5 py-1.5 text-left text-sm text-content transition-colors hover:bg-surface-hover"
              >
                {option.label}
                {isSelected ? <Check className="h-3.5 w-3.5 text-primary" aria-hidden /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
