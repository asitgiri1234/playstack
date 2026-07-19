'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal dialog with a real focus trap.
 *
 * Built on plain elements rather than <dialog> for styling control, which means
 * the accessibility contract is ours to honour: Escape closes, focus moves in
 * on open and returns to the trigger on close, Tab cycles inside, and the
 * backdrop is inert to screen readers. A modal that leaks focus to the page
 * behind it is a keyboard trap in the other direction — the user tabs into
 * content they cannot see.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: DialogProps): React.JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const panel = panelRef.current;
    const focusables = panel?.querySelectorAll<HTMLElement>(FOCUSABLE);
    // Focus the first control, or the panel itself if there is none, so the
    // next Tab starts inside the dialog rather than at the top of the document.
    (focusables?.[0] ?? panel)?.focus();

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const items = panel?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (items === undefined || items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (first === undefined || last === undefined) return;

      // Wrap at both ends — this is the trap.
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    // Stop the page behind from scrolling under the overlay.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      // Return focus where it came from; otherwise it resets to <body> and the
      // keyboard user loses their place entirely.
      previouslyFocused.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-overlay backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby={description !== undefined ? 'dialog-description' : undefined}
        tabIndex={-1}
        className={cn(
          'relative w-full max-w-md rounded-lg border border-border bg-surface-raised p-6 shadow-lg',
        )}
      >
        <h2 id="dialog-title" className="text-lg font-semibold text-content">
          {title}
        </h2>
        {description !== undefined ? (
          <p id="dialog-description" className="mt-2 text-base text-content-muted">
            {description}
          </p>
        ) : null}
        <div className="mt-4">{children}</div>
        {footer !== undefined ? <div className="mt-6 flex justify-end gap-2">{footer}</div> : null}
      </div>
    </div>
  );
}
