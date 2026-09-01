import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuthenticatedBootstrap } from '@/features/auth/hooks/use-authenticated-bootstrap';
import { fetchChatHistoryQueries } from '@/features/chat-history/services/chat-history.service';
import type { ChatQueryListItem } from '@/features/chat-history/types/chat-history.types';
import { CHAT_HISTORY_PAGE_SIZE } from '@/features/chat-history/utils/chat-history-options';
import { useActiveProject } from '@/features/projects/providers/active-project-provider';
import { useTranslation } from '@/i18n';
import {
  mergePage,
  pageAddedNewItems,
  resolveHasMore,
  usePaginatedFetchCursor,
} from '@/shared/hooks/use-paginated-offset';

const SEARCH_DEBOUNCE_MS = 350;
const DEFAULT_ERROR_KEY = 'history.error.loadDescription';

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

export function useChatHistory() {
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

  const queryParams = useMemo(
    () => ({
      limit: CHAT_HISTORY_PAGE_SIZE,
      q: debouncedQuery || undefined,
      projectId: activeProjectId ?? undefined,
    }),
    [debouncedQuery, activeProjectId],
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

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchChatHistoryQueries({ ...queryParams, offset: 0 });
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
  }, [applyInitialPage, queryParams, resetFetchCursor, t]);

  useEffect(() => {
    setItems([]);
    setTotal(0);
    resetFetchCursor(0);
    setHasMore(false);
  }, [activeProjectId, resetFetchCursor]);

  useEffect(() => {
    if (!isReady) {
      return;
    }
    void loadInitial();
  }, [isReady, loadInitial]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const response = await fetchChatHistoryQueries({ ...queryParams, offset: 0 });
      applyInitialPage(response);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : t(DEFAULT_ERROR_KEY);
      setError(message);
    } finally {
      setRefreshing(false);
    }
  }, [applyInitialPage, queryParams, t]);

  const loadMore = useCallback(async () => {
    if (loadingMore || loading || !hasMore) return;

    const initialOffset = getFetchOffset();
    if (initialOffset >= total) return;

    setLoadingMore(true);
    setError(null);
    try {
      let offset = initialOffset;
      let retryDuplicatePage = false;
      let lastResponse: ChatHistoryListResponse | null = null;

      while (true) {
        const response = await fetchChatHistoryQueries({
          ...queryParams,
          offset,
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
        offset = fetchCursor;
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
    getFetchOffset,
    hasMore,
    loading,
    loadingMore,
    queryParams,
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
    reload: loadInitial,
    refresh,
    loadMore,
    hasMore,
    emptyLabel,
  };
}
