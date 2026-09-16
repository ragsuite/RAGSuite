import { listTimeRangeToDateFrom } from '@/shared/utils/list-time-range';

describe('listTimeRangeToDateFrom', () => {
  const now = Date.UTC(2026, 8, 16, 12, 0, 0);

  it('returns undefined for all', () => {
    expect(listTimeRangeToDateFrom('all', now)).toBeUndefined();
  });

  it('maps rolling windows from now', () => {
    expect(listTimeRangeToDateFrom('today', now)).toBe(
      new Date(now - 24 * 60 * 60 * 1000).toISOString(),
    );
    expect(listTimeRangeToDateFrom('7d', now)).toBe(
      new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
    );
    expect(listTimeRangeToDateFrom('30d', now)).toBe(
      new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(),
    );
    expect(listTimeRangeToDateFrom('year', now)).toBe(
      new Date(now - 365 * 24 * 60 * 60 * 1000).toISOString(),
    );
  });
});
