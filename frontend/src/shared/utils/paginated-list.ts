export function appendUniqueById<T>(
  current: readonly T[],
  incoming: readonly T[],
  getId: (item: T) => string,
): T[] {
  if (incoming.length === 0) return [...current];

  const seen = new Set(current.map(getId));
  const merged = [...current];

  for (const item of incoming) {
    const id = getId(item);
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(item);
  }

  return merged;
}

type DeriveOffsetPaginationInput = {
  mergedLength: number;
  pageLength: number;
  limit: number;
  apiTotal?: number | null;
};

type DeriveOffsetPaginationResult = {
  hasMore: boolean;
  total: number;
};

export function deriveOffsetPagination({
  mergedLength,
  pageLength,
  limit,
  apiTotal,
}: DeriveOffsetPaginationInput): DeriveOffsetPaginationResult {
  const total = apiTotal != null ? apiTotal : mergedLength;
  const hasMore =
    apiTotal != null ? mergedLength < apiTotal : pageLength === limit && pageLength > 0;

  return { hasMore, total };
}
