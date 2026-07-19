'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';

/**
 * Chart colours, read from the SAME CSS variables the rest of the UI uses.
 *
 * recharts wants concrete colour strings (SVG fill/stroke), not `var(--x)` —
 * many of its internals compute on the value. So instead of hardcoding hex
 * here (which is exactly how a chart ends up unreadable in dark mode), we read
 * the computed value of each token off the document at runtime, and re-read it
 * whenever the theme changes. One source of colour truth, charts included.
 */
type ChartVar =
  | '--chart-1'
  | '--chart-2'
  | '--chart-3'
  | '--chart-4'
  | '--chart-5'
  | '--chart-grid'
  | '--chart-axis'
  | '--text-muted'
  | '--surface-raised'
  | '--border';

export interface ChartTheme {
  series: string[];
  grid: string;
  axis: string;
  tickText: string;
  tooltipBg: string;
  tooltipBorder: string;
}

/**
 * A concrete-hex fallback for the brief pre-mount window before the CSS vars are
 * read. Charts are not painted during that window (their card shows a loading
 * state), so these never actually render — they exist only to keep `fill` a
 * definite string. Mirrors the light-theme series.
 */
export const FALLBACK_SERIES = ['#38796a', '#6366f1', '#d97706', '#0ea5e9', '#db2777'];

/** Colour for series index `i`, always a string. */
export function seriesColor(theme: ChartTheme | null, i: number): string {
  const series = theme?.series.length ? theme.series : FALLBACK_SERIES;
  return series[i % series.length] ?? FALLBACK_SERIES[0]!;
}

function readVar(name: ChartVar): string {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function useChartTheme(): ChartTheme | null {
  // `resolvedTheme` flips between 'light'/'dark' on toggle; it is the dependency
  // that re-reads the variables so the chart recolours with the page.
  const { resolvedTheme } = useTheme();
  const [theme, setChartTheme] = useState<ChartTheme | null>(null);

  useEffect(() => {
    setChartTheme({
      series: [
        readVar('--chart-1'),
        readVar('--chart-2'),
        readVar('--chart-3'),
        readVar('--chart-4'),
        readVar('--chart-5'),
      ],
      grid: readVar('--chart-grid'),
      axis: readVar('--chart-axis'),
      tickText: readVar('--text-muted'),
      tooltipBg: readVar('--surface-raised'),
      tooltipBorder: readVar('--border'),
    });
  }, [resolvedTheme]);

  return theme;
}
