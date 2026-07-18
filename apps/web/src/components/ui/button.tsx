import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-content-inverted hover:bg-primary-hover border border-transparent',
  secondary: 'bg-surface text-content border border-border-strong hover:bg-surface-hover',
  ghost:
    'bg-transparent text-content-muted hover:bg-surface-hover hover:text-content border border-transparent',
  danger: 'bg-danger-600 text-content-inverted hover:bg-danger-700 border border-transparent',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-9 px-4 text-base gap-2',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = 'secondary',
    size = 'md',
    isLoading = false,
    children,
    disabled,
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      // A loading button must not be clickable twice — the disable is
      // behaviour, not decoration.
      disabled={disabled === true || isLoading}
      className={cn(
        'inline-flex items-center justify-center rounded-sm font-medium transition-colors',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
});
