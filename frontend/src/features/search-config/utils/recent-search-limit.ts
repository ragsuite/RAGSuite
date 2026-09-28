export const RECENT_SEARCH_LIMIT_MIN = 1;
export const RECENT_SEARCH_LIMIT_MAX = 5;
export const RECENT_SEARCH_LIMIT_DEFAULT = 5;

export function clampRecentSearchLimit(value: unknown): number {
  const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : value;
  if (typeof parsed !== 'number' || !Number.isFinite(parsed)) return RECENT_SEARCH_LIMIT_DEFAULT;
  return Math.min(RECENT_SEARCH_LIMIT_MAX, Math.max(RECENT_SEARCH_LIMIT_MIN, Math.trunc(parsed)));
}

export function limitRecentSearches<T>(items: readonly T[], limit: number): T[] {
  return items.slice(0, clampRecentSearchLimit(limit));
}
