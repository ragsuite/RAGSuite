export type ListTimeRange = 'all' | 'today' | '7d' | '30d' | 'year';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const CUTOFF_MS: Record<Exclude<ListTimeRange, 'all'>, number> = {
  today: MS_PER_DAY,
  '7d': 7 * MS_PER_DAY,
  '30d': 30 * MS_PER_DAY,
  year: 365 * MS_PER_DAY,
};

/** Rolling-window start ISO for list filters; `all` returns undefined (no bound). */
export function listTimeRangeToDateFrom(
  range: ListTimeRange,
  nowMs: number = Date.now(),
): string | undefined {
  if (range === 'all') return undefined;
  return new Date(nowMs - CUTOFF_MS[range]).toISOString();
}
