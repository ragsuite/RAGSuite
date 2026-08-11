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
import { useToastRef } from '@/shared/toast/use-toast-ref';

const SEARCH_DEBOUNCE_MS = 350;

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

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetchAuditEvents({ ...queryParams, offset: 0 });
      setEvents(response.events);
      setTotal(response.total);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : t('common.error');
      setError(message);
      setEvents([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [queryParams, t]);

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
      setEvents(response.events);
      setTotal(response.total);
      toastRef.current({ description: t('audit.toast.refresh.success'), variant: 'success' });
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : t('audit.toast.refresh.error');
      setError(message);
      toastRef.current({ description: message, variant: 'error' });
    } finally {
      setRefreshing(false);
    }
  }, [queryParams, t, toastRef]);

  const loadMore = useCallback(async () => {
    if (loadingMore || loading || events.length >= total) return;

    setLoadingMore(true);
    setError(null);

    try {
      const response = await fetchAuditEvents({ ...queryParams, offset: events.length });
      setEvents((current) => [...current, ...response.events]);
      setTotal(response.total);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : t('audit.toast.loadMore.error');
      setError(message);
      toastRef.current({ description: message, variant: 'error' });
    } finally {
      setLoadingMore(false);
    }
  }, [events.length, loading, loadingMore, queryParams, t, toastRef, total]);

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

  const hasMore = events.length < total;

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
