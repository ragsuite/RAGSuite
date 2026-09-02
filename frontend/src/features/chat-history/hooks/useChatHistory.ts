import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuthenticatedBootstrap } from '@/features/auth/hooks/use-authenticated-bootstrap';
import { fetchChatHistoryQueries } from '@/features/chat-history/services/chat-history.service';
import type { ChatQueryListItem } from '@/features/chat-history/types/chat-history.types';
import { CHAT_HISTORY_PAGE_SIZE } from '@/features/chat-history/utils/chat-history-options';
import { useActiveProject } from '@/features/projects/providers/active-project-provider';
import { useTranslation } from '@/i18n';
import type { PageSizeOption } from '@/shared/constants/pagination';
import { useOffsetPagination } from '@/shared/hooks/use-offset-pagination';
import {
  mergePage,
  pageAddedNewItems,
  resolveHasMore,
  usePaginatedFetchCursor,
} from '@/shared/hooks/use-paginated-offset';

const SEARCH_DEBOUNCE_MS = 350;
const DEFAULT_ERROR_KEY = 'history.error.loadDescription';

export type ListPaginationMode = 'append' | 'paged';

type UseChatHistoryOptions = {
  paginationMode?: ListPaginationMode;
};

type ChatHistoryListResponse = Awaited<ReturnType<typeof fetchChatHistoryQueries>>;

function applyHistoryPage(items: ChatQueryListItem[], page: ChatQueryListItem[]): {
  merged: ChatQueryListItem[];
  addedNewItems: boolean;
} {
  const merged = mergePage(items, page, (item) => item.id);
  return {
    merged,
    addedNewItems: pageAddedNewItems(items.length, merged.length),
  };
}

export function useChatHistory(options?: UseChatHistoryOptions) {
  const paginationMode = options?.paginationMode ?? 'append';
  const isPaged = paginationMode === 'paged';

  const { isReady } = useAuthenticatedBootstrap();
  const { activeProjectId } = useActiveProject();
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [items, setItems] = useState<ChatQueryListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { getFetchOffset, resetFetchCursor, advanceFetchCursorBy } = usePaginatedFetchCursor();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const filterResetKey = useMemo(
    () => JSON.stringify({ debouncedQuery, activeProjectId }),
    [activeProjectId, debouncedQuery],
  );

  const { page, pageSize, offset, totalPages, setPage, setPageSize } = useOffsetPagination({
    defaultPageSize: CHAT_HISTORY_PAGE_SIZE as PageSizeOption,
    storageKey: isPaged ? 'chat-history' : undefined,
    total,
    filterResetKey,
  });

  const appendQueryParams = useMemo(
    () => ({
      limit: CHAT_HISTORY_PAGE_SIZE,
      q: debouncedQuery || undefined,
      projectId: activeProjectId ?? undefined,
    }),
    [activeProjectId, debouncedQuery],
  );

  const pagedQueryParams = useMemo(
    () => ({
      limit: pageSize,
      q: debouncedQuery || undefined,
      projectId: activeProjectId ?? undefined,
    }),
    [activeProjectId, debouncedQuery, pageSize],
  );

  const applyInitialPage = useCallback(
    (response: ChatHistoryListResponse) => {
      setItems(response.items);
      setTotal(response.total);
      resetFetchCursor(response.items.length);
      setHasMore(
        resolveHasMore({
          fetchCursor: response.items.length,
          apiTotal: response.total,
          pageLength: response.items.length,
        }),
      );
    },
    [resetFetchCursor],
  );

  const applyPagedPage = useCallback((response: ChatHistoryListResponse) => {
    setItems(response.items);
    setTotal(response.total);
    setHasMore(false);
  }, []);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchChatHistoryQueries({ ...appendQueryParams, offset: 0 });
      applyInitialPage(response);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : t(DEFAULT_ERROR_KEY);
      setError(message);
      setItems([]);
      setTotal(0);
      resetFetchCursor(0);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [applyInitialPage, appendQueryParams, resetFetchCursor, t]);

  const loadPaged = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchChatHistoryQueries({ ...pagedQueryParams, offset });
      applyPagedPage(response);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : t(DEFAULT_ERROR_KEY);
      setError(message);
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [applyPagedPage, offset, pagedQueryParams, t]);

  useEffect(() => {
    if (!isPaged) {
      setItems([]);
      setTotal(0);
      resetFetchCursor(0);
      setHasMore(false);
    }
  }, [activeProjectId, isPaged, resetFetchCursor]);

  useEffect(() => {
    if (!isReady) {
      return;
    }
    if (isPaged) {
      void loadPaged();
      return;
    }
    void loadInitial();
  }, [isPaged, isReady, loadInitial, loadPaged]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      if (isPaged) {
        const response = await fetchChatHistoryQueries({ ...pagedQueryParams, offset });
        applyPagedPage(response);
      } else {
        const response = await fetchChatHistoryQueries({ ...appendQueryParams, offset: 0 });
        applyInitialPage(response);
      }
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : t(DEFAULT_ERROR_KEY);
      setError(message);
    } finally {
      setRefreshing(false);
    }
  }, [appendQueryParams, applyInitialPage, applyPagedPage, isPaged, offset, pagedQueryParams, t]);

  const loadMore = useCallback(async () => {
    if (isPaged || loadingMore || loading || !hasMore) return;

    const initialOffset = getFetchOffset();
    if (initialOffset >= total) return;

    setLoadingMore(true);
    setError(null);
    try {
      let currentOffset = initialOffset;
      let retryDuplicatePage = false;
      let lastResponse: ChatHistoryListResponse | null = null;

      while (true) {
        const response = await fetchChatHistoryQueries({
          ...appendQueryParams,
          offset: currentOffset,
        });
        lastResponse = response;

        let addedNewItems = false;
        setItems((current) => {
          const result = applyHistoryPage(current, response.items);
          addedNewItems = result.addedNewItems;
          return result.merged;
        });

        const fetchCursor = advanceFetchCursorBy(response.items.length);
        setTotal(response.total);
        setHasMore(
          resolveHasMore({
            fetchCursor,
            apiTotal: response.total,
            pageLength: response.items.length,
          }),
        );

        const shouldRetry =
          !addedNewItems &&
          response.items.length > 0 &&
          fetchCursor < response.total &&
          !retryDuplicatePage;

        if (!shouldRetry) {
          break;
        }

        retryDuplicatePage = true;
        currentOffset = fetchCursor;
      }

      if (lastResponse && lastResponse.items.length === 0) {
        setHasMore(false);
      }
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : t(DEFAULT_ERROR_KEY);
      setError(message);
    } finally {
      setLoadingMore(false);
    }
  }, [
    advanceFetchCursorBy,
    appendQueryParams,
    getFetchOffset,
    hasMore,
    isPaged,
    loading,
    loadingMore,
    t,
    total,
  ]);

  const emptyLabel = t('history.empty');

  return {
    items,
    total,
    query,
    setQuery,
    loading,
    loadingMore,
    refreshing,
    error,
    reload: isPaged ? loadPaged : loadInitial,
    refresh,
    loadMore,
    hasMore,
    emptyLabel,
    page,
    pageSize,
    totalPages,
    setPage,
    setPageSize,
    paginationMode,
  };
}
