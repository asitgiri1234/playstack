import type { Config } from 'tailwindcss';

/**
 * Every colour maps to a CSS variable from globals.css. Nothing here holds a
 * literal hex — that indirection is what lets Phase 5 add dark mode by
 * redefining the variables rather than touching components.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: {
          DEFAULT: 'var(--surface)',
          raised: 'var(--surface-raised)',
          hover: 'var(--surface-hover)',
          sunken: 'var(--surface-sunken)',
        },
        border: {
          DEFAULT: 'var(--border)',
          strong: 'var(--border-strong)',
        },
        content: {
          DEFAULT: 'var(--text)',
          muted: 'var(--text-muted)',
          subtle: 'var(--text-subtle)',
          inverted: 'var(--text-inverted)',
        },
        primary: {
          DEFAULT: 'var(--primary)',
          hover: 'var(--primary-hover)',
          subtle: 'var(--primary-subtle)',
          text: 'var(--primary-text)',
        },
        success: {
          50: 'var(--success-50)',
          600: 'var(--success-600)',
          700: 'var(--success-700)',
          // Dark-aware pair for badges/alerts — dims to a translucent tint in
          // dark mode instead of glowing.
          surface: 'var(--success-surface)',
          text: 'var(--success-text)',
        },
        danger: {
          50: 'var(--danger-50)',
          100: 'var(--danger-100)',
          500: 'var(--danger-500)',
          600: 'var(--danger-600)',
          700: 'var(--danger-700)',
          surface: 'var(--danger-surface)',
          text: 'var(--danger-text)',
        },
        warning: {
          50: 'var(--warning-50)',
          600: 'var(--warning-600)',
          surface: 'var(--warning-surface)',
          text: 'var(--warning-text)',
        },
        // Modal/drawer scrim. A token because a light-mode zinc scrim is
        // invisible over a dark surface.
        overlay: 'var(--overlay)',
        // Chart series, exposed to Tailwind so legends/tables can match the
        // chart marks. The charts themselves read the CSS vars at runtime.
        chart: {
          1: 'var(--chart-1)',
          2: 'var(--chart-2)',
          3: 'var(--chart-3)',
          4: 'var(--chart-4)',
          5: 'var(--chart-5)',
        },
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
        sm: 'var(--radius-sm)',
        lg: 'var(--radius-lg)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
      fontFamily: {
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      /**
       * A real hierarchy, not arbitrary sizes. Each step has a deliberate
       * line-height and tracking; display sizes get tighter tracking because
       * large text looks loose at default spacing.
       */
      fontSize: {
        xs: ['0.75rem', { lineHeight: '1rem', letterSpacing: '0.01em' }],
        sm: ['0.8125rem', { lineHeight: '1.25rem' }],
        base: ['0.875rem', { lineHeight: '1.375rem' }],
        md: ['0.9375rem', { lineHeight: '1.5rem' }],
        lg: ['1.0625rem', { lineHeight: '1.625rem', letterSpacing: '-0.01em' }],
        xl: ['1.25rem', { lineHeight: '1.75rem', letterSpacing: '-0.015em' }],
        '2xl': ['1.5rem', { lineHeight: '2rem', letterSpacing: '-0.02em' }],
      },
    },
  },
  plugins: [],
};

export default config;
