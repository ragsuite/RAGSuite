import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import {
  configureAppSearchWidgetProject,
  fetchSearchWidgetSettings,
  streamSearchWidgetQuery,
  submitSearchWidgetFeedback,
  type AppSearchWidgetSettings,
} from '@/features/app-search-widget/services/app-search-widget.service';
import {
  generateSearchSessionId,
  getEmbedSearchRecentKey,
  getEmbedSearchSessionKey,
  readStoredRecentSearches,
  readStoredSearchSessionId,
  rememberRecentSearch,
  writeStoredSearchSessionId,
  type StoredRecentSearch,
} from '@/features/app-search-widget/utils/app-search-widget-session';
import { useActiveProject } from '@/features/projects/providers/active-project-provider';
import type { SearchTestResult } from '@/features/search-config/types/search-config.types';
import type { SearchTestFeedbackPayload } from '@/features/search-config/utils/search-test-feedback-options';

type AppSearchWidgetContextValue = {
  settings: AppSearchWidgetSettings | null;
  settingsLoading: boolean;
  searchActive: boolean;
  result: SearchTestResult | null;
  loading: boolean;
  streamingAnswer: string | null;
  recentSearches: StoredRecentSearch[];
  runSearch: (query: string) => Promise<void>;
  submitFeedback: (payload: SearchTestFeedbackPayload) => Promise<boolean>;
};

const AppSearchWidgetContext = createContext<AppSearchWidgetContextValue | null>(null);

type Props = {
  children: React.ReactNode;
};

export function AppSearchWidgetProvider({ children }: Props) {
  const { activeProjectId } = useActiveProject();
  const [settings, setSettings] = useState<AppSearchWidgetSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [result, setResult] = useState<SearchTestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [streamingAnswer, setStreamingAnswer] = useState<string | null>(null);
  const [recentSearches, setRecentSearches] = useState<StoredRecentSearch[]>([]);
  const sessionIdRef = useRef<string | undefined>(undefined);
  const requestIdRef = useRef(0);
  const settingsRef = useRef<AppSearchWidgetSettings | null>(null);

  useEffect(() => {
    configureAppSearchWidgetProject(activeProjectId);
    setResult(null);
    setStreamingAnswer(null);
    settingsRef.current = null;
    if (!activeProjectId) {
      sessionIdRef.current = undefined;
      setRecentSearches([]);
      setSettings(null);
      setSettingsLoading(false);
      return;
    }

    const sessionKey = getEmbedSearchSessionKey(activeProjectId);
    const recentKey = getEmbedSearchRecentKey(activeProjectId);
    sessionIdRef.current = readStoredSearchSessionId(sessionKey);
    setRecentSearches(readStoredRecentSearches(recentKey));

    let cancelled = false;
    setSettingsLoading(true);
    void fetchSearchWidgetSettings()
      .then((next) => {
        if (cancelled) return;
        settingsRef.current = next;
        setSettings(next);
      })
      .catch(() => {
        if (cancelled) return;
        settingsRef.current = null;
        setSettings(null);
      })
      .finally(() => {
        if (!cancelled) setSettingsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeProjectId]);

  const runSearch = useCallback(async (query: string) => {
    const current = settingsRef.current;
    if (!current || !activeProjectId) return;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setStreamingAnswer(null);
    setResult(null);
    try {
      const next = await streamSearchWidgetQuery(
        query,
        current,
        sessionIdRef.current,
        (_token, accumulated) => {
          if (requestIdRef.current !== requestId) return;
          setStreamingAnswer(accumulated);
        },
      );
      if (requestIdRef.current !== requestId) return;
      if (next.sessionId) {
        sessionIdRef.current = next.sessionId;
        writeStoredSearchSessionId(getEmbedSearchSessionKey(activeProjectId), next.sessionId);
      } else if (!sessionIdRef.current) {
        const generated = generateSearchSessionId();
        sessionIdRef.current = generated;
        writeStoredSearchSessionId(getEmbedSearchSessionKey(activeProjectId), generated);
      }
      setRecentSearches(rememberRecentSearch(getEmbedSearchRecentKey(activeProjectId), query));
      setResult(next);
      setStreamingAnswer(null);
    } catch {
      if (requestIdRef.current !== requestId) return;
      setResult(null);
      setStreamingAnswer(null);
    } finally {
      if (requestIdRef.current === requestId) setLoading(false);
    }
  }, [activeProjectId]);

  const submitFeedback = useCallback(async (payload: SearchTestFeedbackPayload) => {
    try {
      await submitSearchWidgetFeedback(payload, sessionIdRef.current ?? result?.sessionId);
      return true;
    } catch {
      return false;
    }
  }, [result?.sessionId]);

  const value = useMemo<AppSearchWidgetContextValue>(
    () => ({
      settings,
      settingsLoading,
      searchActive: settings?.searchActive ?? false,
      result,
      loading,
      streamingAnswer,
      recentSearches,
      runSearch,
      submitFeedback,
    }),
    [settings, settingsLoading, result, loading, streamingAnswer, recentSearches, runSearch, submitFeedback],
  );

  return <AppSearchWidgetContext.Provider value={value}>{children}</AppSearchWidgetContext.Provider>;
}

export function useAppSearchWidget() {
  const context = useContext(AppSearchWidgetContext);
  if (!context) {
    throw new Error('useAppSearchWidget must be used inside AppSearchWidgetProvider');
  }
  return context;
}
