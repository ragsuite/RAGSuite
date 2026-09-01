import { useCallback, useRef } from 'react';

import { appendUniqueById } from '@/shared/utils/paginated-list';

export function pageAddedNewItems(beforeLength: number, afterLength: number): boolean {
  return afterLength > beforeLength;
}

export function mergePage<T>(
  current: readonly T[],
  incoming: readonly T[],
  getId: (item: T) => string,
): T[] {
  return appendUniqueById(current, incoming, getId);
}

export function advanceFetchCursor(currentCursor: number, pageLength: number): number {
  return currentCursor + pageLength;
}

type ResolveHasMoreInput = {
  fetchCursor: number;
  apiTotal: number;
  pageLength: number;
};

export function resolveHasMore({ fetchCursor, apiTotal, pageLength }: ResolveHasMoreInput): boolean {
  if (pageLength === 0) {
    return false;
  }
  return fetchCursor < apiTotal;
}

export function usePaginatedFetchCursor() {
  const fetchCursorRef = useRef(0);

  const getFetchOffset = useCallback(() => fetchCursorRef.current, []);

  const resetFetchCursor = useCallback((nextOffset: number) => {
    fetchCursorRef.current = nextOffset;
  }, []);

  const advanceFetchCursorBy = useCallback((pageLength: number) => {
    fetchCursorRef.current = advanceFetchCursor(fetchCursorRef.current, pageLength);
    return fetchCursorRef.current;
  }, []);

  return {
    fetchCursorRef,
    getFetchOffset,
    resetFetchCursor,
    advanceFetchCursorBy,
  };
}
