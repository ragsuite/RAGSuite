import { brandTokens } from '@/theme/brand-tokens';

const { color, dark } = brandTokens;

const chartPaletteLight = {
  seriesPrimary: color.pineBright,
  seriesSecondary: color.pine,
  seriesHighlight: color.ochre,
  gridLine: color.hairline,
  axisLabel: color.inkFaint,
  pieSeries: [
    color.pineBright,
    color.pine,
    color.ochre,
    color.pineDeep,
    color.inkSoft,
    color.hairlineStrong,
  ],
} as const;

const chartPaletteDark = {
  seriesPrimary: color.pineBright,
  seriesSecondary: dark.chartSeriesMuted,
  seriesHighlight: color.ochre,
  gridLine: dark.chartGrid,
  axisLabel: dark.chartAxis,
  pieSeries: [
    color.pineBright,
    dark.chartSeriesMuted,
    color.ochre,
    dark.borderStrong,
    dark.textSecondary,
    dark.textFaint,
  ],
} as const;

export type ChartPalette = {
  readonly seriesPrimary: string;
  readonly seriesSecondary: string;
  readonly seriesHighlight: string;
  readonly gridLine: string;
  readonly axisLabel: string;
  readonly pieSeries: readonly string[];
};

/** AGENTS.md §5 — pine family primary; ochre for verified/highlight; hairline gridlines. */
export const chartPalette: ChartPalette = chartPaletteLight;

export function getChartPalette(mode: 'light' | 'dark'): ChartPalette {
  return mode === 'dark' ? chartPaletteDark : chartPaletteLight;
}

export function chartPieColor(index: number, mode: 'light' | 'dark' = 'light', fallback?: string): string {
  const palette = getChartPalette(mode);
  return palette.pieSeries[index] ?? fallback ?? palette.pieSeries[index % palette.pieSeries.length];
}
