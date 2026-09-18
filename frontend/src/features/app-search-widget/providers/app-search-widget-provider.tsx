import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import {
  configureAppSearchWidgetProject,
  startSearchWidgetSettingsFetch,
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
import { resolveEmbedSiteHost } from '@/features/app-chat-widget/utils/app-chat-widget-embed-site-host';
import { useActiveProject } from '@/features/projects/providers/active-project-provider';
import type { SearchTestResult } from '@/features/search-config/types/search-config.types';
import type { SearchTestFeedbackPayload } from '@/features/search-config/utils/search-test-feedback-options';
import {
  ensureVisitorLanguageStorageListener,
  hydrateVisitorLanguage,
  resolveEffectiveLanguage,
  setVisitorLanguage as persistVisitorLanguage,
  subscribeVisitorLanguageChanges,
  toApiVisitorLanguage,
  type VisitorLanguageCode,
} from '@/platform/widget-visitor-language';

type AppSearchWidgetContextValue = {
  settings: AppSearchWidgetSettings | null;
  settingsLoading: boolean;
  /** True when the settings request failed (not the same as search inactive). */
  settingsLoadFailed: boolean;
  searchActive: boolean;
  result: SearchTestResult | null;
  loading: boolean;
  streamingAnswer: string | null;
  recentSearches: StoredRecentSearch[];
  runSearch: (query: string) => Promise<void>;
  submitFeedback: (payload: SearchTestFeedbackPayload) => Promise<boolean>;
  visitorLanguage: VisitorLanguageCode | '';
  effectiveLanguage: string;
  setVisitorLanguage: (language: string) => void;
};

const AppSearchWidgetContext = createContext<AppSearchWidgetContextValue | null>(null);

type Props = {
  children: React.ReactNode;
};

export function AppSearchWidgetProvider({ children }: Props) {
  const { activeProjectId } = useActiveProject();
  const embedSiteHost = useMemo(() => resolveEmbedSiteHost(), []);
  const [settings, setSettings] = useState<AppSearchWidgetSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsLoadFailed, setSettingsLoadFailed] = useState(false);
  const [result, setResult] = useState<SearchTestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [streamingAnswer, setStreamingAnswer] = useState<string | null>(null);
  const [recentSearches, setRecentSearches] = useState<StoredRecentSearch[]>([]);
  const [visitorLanguage, setVisitorLanguageState] = useState<VisitorLanguageCode | ''>('');
  const sessionIdRef = useRef<string | undefined>(undefined);
  const requestIdRef = useRef(0);
  const settingsRef = useRef<AppSearchWidgetSettings | null>(null);
  const effectiveLanguageRef = useRef('en');

  const effectiveLanguage = useMemo(
    () => resolveEffectiveLanguage(visitorLanguage, settings?.config.language),
    [visitorLanguage, settings?.config.language],
  );
  effectiveLanguageRef.current = effectiveLanguage;

  useEffect(() => {
    ensureVisitorLanguageStorageListener();
  }, []);

  useEffect(() => {
    if (!activeProjectId) {
      setVisitorLanguageState('');
      return;
    }
    let cancelled = false;
    void hydrateVisitorLanguage(activeProjectId, embedSiteHost).then((stored) => {
      if (!cancelled) setVisitorLanguageState(stored);
    });
    const unsubscribe = subscribeVisitorLanguageChanges((payload) => {
      if (payload.projectId !== activeProjectId) return;
      if (payload.siteHost !== embedSiteHost) return;
      setVisitorLanguageState(payload.language);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [activeProjectId, embedSiteHost]);

  const setVisitorLanguage = useCallback(
    (language: string) => {
      if (!activeProjectId) return;
      const next = persistVisitorLanguage(activeProjectId, embedSiteHost, language);
      setVisitorLanguageState(next);
    },
    [activeProjectId, embedSiteHost],
  );

  useEffect(() => {
    configureAppSearchWidgetProject(activeProjectId);
    setResult(null);
    setStreamingAnswer(null);
    settingsRef.current = null;
    if (!activeProjectId) {
      sessionIdRef.current = undefined;
      setRecentSearches([]);
      setSettings(null);
      setSettingsLoadFailed(false);
      setSettingsLoading(false);
      return;
    }

    const sessionKey = getEmbedSearchSessionKey(activeProjectId);
    const recentKey = getEmbedSearchRecentKey(activeProjectId);
    sessionIdRef.current = readStoredSearchSessionId(sessionKey);
    setRecentSearches([]);

    let cancelled = false;
    setSettingsLoading(true);
    setSettingsLoadFailed(false);
    const { paint, full } = startSearchWidgetSettingsFetch();
    void paint
      .then((next) => {
        if (cancelled) return;
        settingsRef.current = next;
        setSettings(next);
        setSettingsLoadFailed(false);
        if (next.storeHistoryEnabled) {
          setRecentSearches(readStoredRecentSearches(recentKey));
        } else {
          setRecentSearches([]);
        }
        setSettingsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        settingsRef.current = null;
        setSettings(null);
        setSettingsLoadFailed(true);
        setSettingsLoading(false);
      });

    void full
      .then((next) => {
        if (cancelled) return;
        settingsRef.current = next;
        setSettings(next);
        setSettingsLoadFailed(false);
        if (next.storeHistoryEnabled) {
          setRecentSearches(readStoredRecentSearches(recentKey));
        } else {
          setRecentSearches([]);
        }
      })
      .catch(() => {
        // Paint may already have succeeded; keep paint settings on enrich failure.
        if (cancelled || settingsRef.current) return;
        settingsRef.current = null;
        setSettings(null);
        setSettingsLoadFailed(true);
        setSettingsLoading(false);
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
      const language = toApiVisitorLanguage(effectiveLanguageRef.current) || undefined;
      const next = await streamSearchWidgetQuery(
        query,
        current,
        sessionIdRef.current,
        (_token, accumulated) => {
          if (requestIdRef.current !== requestId) return;
          setStreamingAnswer(accumulated);
        },
        { language },
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
      setRecentSearches(
        current.storeHistoryEnabled
          ? rememberRecentSearch(getEmbedSearchRecentKey(activeProjectId), query)
          : [],
      );
      setResult(next);
      // Keep streamed HTML for TTS highlight continuity; cleared on next search.
      if (!next.answer?.trim()) {
        setStreamingAnswer(null);
      }
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
      settingsLoadFailed,
      // Optimistic true until settings arrive — null settings after a failed fetch
      // must not look like "inactive" (that silently removes the host iframe).
      searchActive: settings ? settings.searchActive : true,
      result,
      loading,
      streamingAnswer,
      recentSearches,
      runSearch,
      submitFeedback,
      visitorLanguage,
      effectiveLanguage,
      setVisitorLanguage,
    }),
    [
      settings,
      settingsLoading,
      settingsLoadFailed,
      result,
      loading,
      streamingAnswer,
      recentSearches,
      runSearch,
      submitFeedback,
      visitorLanguage,
      effectiveLanguage,
      setVisitorLanguage,
    ],
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
