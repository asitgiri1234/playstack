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

// Primary is the ONE place the accent fills a shape. Secondary and ghost stay
// neutral so a screen never has more than one or two accent surfaces.
const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-primary text-content-inverted hover:bg-primary-hover border border-transparent shadow-sm',
  secondary: 'bg-surface text-content border border-border-strong hover:bg-surface-hover',
  ghost:
    'bg-transparent text-content-muted hover:bg-surface-hover hover:text-content border border-transparent',
  danger:
    'bg-danger-600 text-content-inverted hover:bg-danger-700 border border-transparent shadow-sm',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
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
        'inline-flex select-none items-center justify-center whitespace-nowrap rounded-sm font-medium transition-colors',
        'disabled:pointer-events-none disabled:opacity-45',
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
