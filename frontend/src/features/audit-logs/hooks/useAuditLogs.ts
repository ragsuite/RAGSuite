import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuthenticatedBootstrap } from '@/features/auth/hooks/use-authenticated-bootstrap';
import { fetchAuditEvents } from '@/features/audit-logs/services/audit-log.service';
import type {
  AuditCategoryFilter,
  AuditEvent,
  AuditProjectFilter,
  AuditSeverityFilter,
  AuditStatusFilter,
} from '@/features/audit-logs/types/audit-log.types';
import {
  AUDIT_LOG_PAGE_SIZE,
  countActiveAuditFilters,
  getAuditProjectFilterOptions,
} from '@/features/audit-logs/utils/audit-log-options';
import { useActiveProject } from '@/features/projects/providers/active-project-provider';
import { useTranslation } from '@/i18n';
import {
  mergePage,
  pageAddedNewItems,
  resolveHasMore,
  usePaginatedFetchCursor,
} from '@/shared/hooks/use-paginated-offset';
import { useToastRef } from '@/shared/toast/use-toast-ref';

const SEARCH_DEBOUNCE_MS = 350;

type AuditEventsResponse = Awaited<ReturnType<typeof fetchAuditEvents>>;

function applyAuditPage(events: AuditEvent[], page: AuditEventsResponse['events']): {
  merged: AuditEvent[];
  addedNewItems: boolean;
} {
  const merged = mergePage(events, page, (event) => event.id);
  return {
    merged,
    addedNewItems: pageAddedNewItems(events.length, merged.length),
  };
}

export function useAuditLogs() {
  const { isReady } = useAuthenticatedBootstrap();
  const { projects } = useActiveProject();
  const { t } = useTranslation();
  const toastRef = useToastRef();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [project, setProject] = useState<AuditProjectFilter>('all');
  const [category, setCategory] = useState<AuditCategoryFilter>('all');
  const [severity, setSeverity] = useState<AuditSeverityFilter>('all');
  const [status, setStatus] = useState<AuditStatusFilter>('all');

  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const { getFetchOffset, resetFetchCursor, advanceFetchCursorBy } = usePaginatedFetchCursor();

  const projectOptions = useMemo(() => getAuditProjectFilterOptions(t, projects), [projects, t]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const queryParams = useMemo(
    () => ({
      limit: AUDIT_LOG_PAGE_SIZE,
      q: debouncedQuery || undefined,
      project,
      category,
      severity,
      status,
    }),
    [category, debouncedQuery, project, severity, status],
  );

  const applyInitialPage = useCallback(
    (response: AuditEventsResponse) => {
      setEvents(response.events);
      setTotal(response.total);
      resetFetchCursor(response.events.length);
      setHasMore(
        resolveHasMore({
          fetchCursor: response.events.length,
          apiTotal: response.total,
          pageLength: response.events.length,
        }),
      );
    },
    [resetFetchCursor],
  );

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetchAuditEvents({ ...queryParams, offset: 0 });
      applyInitialPage(response);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : t('common.error');
      setError(message);
      setEvents([]);
      setTotal(0);
      resetFetchCursor(0);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [applyInitialPage, queryParams, resetFetchCursor, t]);

  useEffect(() => {
    if (!isReady) {
      return;
    }
    void loadInitial();
  }, [isReady, loadInitial]);

  const reload = useCallback(() => void loadInitial(), [loadInitial]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);

    try {
      const response = await fetchAuditEvents({ ...queryParams, offset: 0 });
      applyInitialPage(response);
      toastRef.current({ description: t('audit.toast.refresh.success'), variant: 'success' });
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : t('audit.toast.refresh.error');
      setError(message);
      toastRef.current({ description: message, variant: 'error' });
    } finally {
      setRefreshing(false);
    }
  }, [applyInitialPage, queryParams, t, toastRef]);

  const loadMore = useCallback(async () => {
    if (loadingMore || loading || !hasMore) return;

    const initialOffset = getFetchOffset();
    if (initialOffset >= total) return;

    setLoadingMore(true);
    setError(null);

    try {
      let offset = initialOffset;
      let retryDuplicatePage = false;
      let lastResponse: AuditEventsResponse | null = null;

      while (true) {
        const response = await fetchAuditEvents({ ...queryParams, offset });
        lastResponse = response;

        let addedNewItems = false;
        setEvents((current) => {
          const result = applyAuditPage(current, response.events);
          addedNewItems = result.addedNewItems;
          return result.merged;
        });

        const fetchCursor = advanceFetchCursorBy(response.events.length);
        setTotal(response.total);
        setHasMore(
          resolveHasMore({
            fetchCursor,
            apiTotal: response.total,
            pageLength: response.events.length,
          }),
        );

        const shouldRetry =
          !addedNewItems &&
          response.events.length > 0 &&
          fetchCursor < response.total &&
          !retryDuplicatePage;

        if (!shouldRetry) {
          break;
        }

        retryDuplicatePage = true;
        offset = fetchCursor;
      }

      if (lastResponse && lastResponse.events.length === 0) {
        setHasMore(false);
      }
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : t('audit.toast.loadMore.error');
      setError(message);
      toastRef.current({ description: message, variant: 'error' });
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
    toastRef,
    total,
  ]);

  const activeFilterCount = useMemo(
    () => countActiveAuditFilters({ project, category, severity, status }),
    [category, project, severity, status],
  );

  const clearFilters = useCallback(() => {
    setProject('all');
    setCategory('all');
    setSeverity('all');
    setStatus('all');
    setQuery('');
  }, []);

  const emptyLabel = t('audit.empty');

  return {
    events,
    total,
    limit: AUDIT_LOG_PAGE_SIZE,
    query,
    setQuery,
    project,
    setProject,
    category,
    setCategory,
    severity,
    setSeverity,
    status,
    setStatus,
    projectOptions,
    activeFilterCount,
    clearFilters,
    loading,
    loadingMore,
    refreshing,
    error,
    reload,
    refresh,
    loadMore,
    hasMore,
    emptyLabel,
  };
}
