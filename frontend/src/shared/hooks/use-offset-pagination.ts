import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  clampPage,
  offsetForPage,
  pageCount,
  type PageSizeOption,
} from '@/shared/constants/pagination';
import { readStoredPageSize, writeStoredPageSize } from '@/shared/utils/pagination-storage';

type UseOffsetPaginationOptions = {
  defaultPageSize: PageSizeOption;
  storageKey?: string;
  total: number;
  /** When this value changes, page resets to 1. */
  filterResetKey: string;
};

export function useOffsetPagination({
  defaultPageSize,
  storageKey,
  total,
  filterResetKey,
}: UseOffsetPaginationOptions) {
  const [pageSize, setPageSizeState] = useState<PageSizeOption>(() =>
    storageKey ? readStoredPageSize(storageKey, defaultPageSize) : defaultPageSize,
  );
  const [page, setPageState] = useState(1);

  useEffect(() => {
    setPageState(1);
  }, [filterResetKey, pageSize]);

  useEffect(() => {
    setPageState((current) => clampPage(current, total, pageSize));
  }, [total, pageSize]);

  const totalPages = useMemo(() => pageCount(total, pageSize), [total, pageSize]);
  const offset = useMemo(() => offsetForPage(page, pageSize), [page, pageSize]);

  const setPage = useCallback(
    (next: number) => {
      setPageState(clampPage(next, total, pageSize));
    },
    [pageSize, total],
  );

  const setPageSize = useCallback(
    (next: PageSizeOption) => {
      if (storageKey) {
        writeStoredPageSize(storageKey, next);
      }
      setPageSizeState(next);
      setPageState(1);
    },
    [storageKey],
  );

  return {
    page,
    pageSize,
    offset,
    totalPages,
    setPage,
    setPageSize,
  };
}
