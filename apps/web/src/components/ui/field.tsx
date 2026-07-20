import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { cn } from '@/lib/utils';

interface FieldShellProps {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  required?: boolean;
  children: (props: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

/**
 * Owns the label/error/hint wiring so no input can be built without them.
 *
 * The id is generated and threaded to htmlFor + aria-describedby: a label that
 * is merely adjacent is not a label, and a screen reader announcing "edit text"
 * with no name is a broken form.
 */
export function Field({
  label,
  error,
  hint,
  required,
  children,
}: FieldShellProps): React.JSX.Element {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = error !== undefined ? errorId : hint !== undefined ? hintId : undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-medium text-content-muted">
        {label}
        {required === true ? (
          <span className="ml-1 text-content-subtle" aria-hidden>
            *
          </span>
        ) : null}
      </label>
      {children({ id, describedBy, invalid: error !== undefined })}
      {error !== undefined ? (
        // role=alert so the message is announced when validation fails, not
        // only when someone happens to tab back to the field.
        <p id={errorId} role="alert" className="text-xs text-danger-text">
          {error}
        </p>
      ) : hint !== undefined ? (
        <p id={hintId} className="text-xs text-content-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const inputStyles = cn(
  'ring-focus w-full rounded-sm border bg-surface px-3 text-sm text-content',
  'placeholder:text-content-subtle',
  'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-content-subtle',
  'transition-[color,border-color,box-shadow] duration-150',
);

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid = false, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        inputStyles,
        'h-9',
        invalid ? 'border-danger-500' : 'border-border-strong',
        className,
      )}
      {...props}
    />
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, invalid = false, children, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        inputStyles,
        'h-9',
        invalid ? 'border-danger-500' : 'border-border-strong',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
});
