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
        // Semantic hues — dark-aware pairs. `surface`/`text` are the tinted
        // badge/alert pair; the numbered keys are solid marks (status dot,
        // destructive button). All desaturated to sit calmly.
        success: {
          600: 'var(--success-dot)',
          surface: 'var(--success-surface)',
          text: 'var(--success-text)',
        },
        danger: {
          500: 'var(--danger-solid)',
          600: 'var(--danger-solid)',
          700: 'var(--danger-solid-hover)',
          surface: 'var(--danger-surface)',
          text: 'var(--danger-text)',
        },
        warning: {
          surface: 'var(--warning-surface)',
          text: 'var(--warning-text)',
        },
        // Modal/drawer scrim.
        overlay: 'var(--overlay)',
        // Chart marks, exposed to Tailwind so legends/tables match the chart.
        // The charts themselves read the CSS vars at runtime (chart-theme.ts).
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
        // The next/font vars, with a system fallback so text never disappears
        // if the font var is somehow unset.
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      /**
       * The type scale — 12/13/14/15/17/20/24/30, a tight premium register.
       * Most UI text is 13–14px; labels 12px. Display sizes carry negative
       * tracking because large text reads loose at default spacing.
       */
      fontSize: {
        xs: ['0.75rem', { lineHeight: '1rem' }], // 12 — labels, meta
        sm: ['0.8125rem', { lineHeight: '1.25rem' }], // 13 — dense UI, table cells
        base: ['0.875rem', { lineHeight: '1.4285' }], // 14 — body default
        md: ['0.9375rem', { lineHeight: '1.5rem' }], // 15
        lg: ['1.0625rem', { lineHeight: '1.5rem', letterSpacing: '-0.014em' }], // 17
        xl: ['1.25rem', { lineHeight: '1.6rem', letterSpacing: '-0.018em' }], // 20
        '2xl': ['1.5rem', { lineHeight: '1.85rem', letterSpacing: '-0.021em' }], // 24
        '3xl': ['1.875rem', { lineHeight: '2.2rem', letterSpacing: '-0.024em' }], // 30
      },
      transitionDuration: {
        // The house motion: subtle and fast.
        DEFAULT: '140ms',
      },
    },
  },
  plugins: [],
};

export default config;
