import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useAuthenticatedBootstrap } from '@/features/auth/hooks/use-authenticated-bootstrap';
import { useActiveProject } from '@/features/projects/providers/active-project-provider';

import type { SearchModelConnectionTestResult } from '@/features/search-config/services/search-config.service';
import {
    addAllowedDomain,
    clearSearchHistory,
    configureSearchConfigProject,
    deleteSearchHistoryBySessions,
    deleteSearchMessage,
    fetchSearchConfigBundle,
    refreshModelStatus,
    refreshSearchHistory,
    refreshSettingsOverview,
    refreshSettingsSection,
    regenerateIntegrationScript,
    removeAllowedDomain,
    runSearchTest,
    saveCitationFormat,
    saveModelSettings,
    savePredefinedQuestions,
    saveSearchBoxConfig,
    saveSearchBoxCustomization,
    saveSearchResponseConfig,
    saveSearchStatus,
    saveSystemPrompt,
    submitSearchTestFeedback,
    testSearchModelConnection,
    type SearchModelConnectionTestOptions,
    type SearchModelSettingsSaveOptions,
} from '@/features/search-config/services/search-config.service';
import type {
    AllowedDomain,
    CitationFormat,
    ModelSettings,
    PredefinedQuestionsSettings,
    SearchBoxConfig,
    SearchBoxCustomization,
    SearchConfigBundle,
    SearchConfigFeedback,
    SearchConfigPrimaryTab,
    SearchTestCitation,
    SearchTestResult,
    SettingsSection,
    TrainingSubTab,
} from '@/features/search-config/types/search-config.types';
import type { SearchTestFeedbackPayload } from '@/features/search-config/utils/search-test-feedback-options';
import { resolveAppErrorMessage, useTranslation } from '@/i18n';

type SearchConfigContextValue = {
  bundle: SearchConfigBundle | null;
  loading: boolean;
  refreshing: boolean;
  saving: boolean;
  error: string | null;
  feedback: SearchConfigFeedback;
  primaryTab: SearchConfigPrimaryTab;
  trainingSubTab: TrainingSubTab;
  settingsSection: SettingsSection;
  testResult: SearchTestResult | null;
  testLoading: boolean;
  testStreamingAnswer: string | null;
  testStreamingSources: SearchTestCitation[];
  setPrimaryTab: (tab: SearchConfigPrimaryTab) => void;
  setTrainingSubTab: (tab: TrainingSubTab) => void;
  setSettingsSection: (section: SettingsSection) => void;
  refresh: () => Promise<void>;
  clearFeedback: () => void;
  notify: (message: string, type?: 'success' | 'error') => void;
  handleSaveModelSettings: (settings: ModelSettings, options?: SearchModelSettingsSaveOptions) => Promise<void>;
  handleTestModelConnection: (
    settings: Pick<ModelSettings, 'provider' | 'chatModel' | 'embeddingModel' | 'apiKey'>,
    options?: SearchModelConnectionTestOptions,
  ) => Promise<SearchModelConnectionTestResult>;
  handleRefreshModelStatus: () => Promise<void>;
  handleSaveSearchStatus: (enabled: boolean) => Promise<void>;
  handleSaveSystemPrompt: (prompt: string) => Promise<void>;
  handleSaveResponseConfig: (responseType: 'long' | 'short') => Promise<void>;
  handleAddDomain: (domain: string, scope?: AllowedDomain['scope']) => Promise<boolean>;
  handleRemoveDomain: (id: string) => Promise<void>;
  handleSaveCitation: (format: CitationFormat) => Promise<void>;
  handleSaveSearchBoxConfig: (config: SearchBoxConfig) => Promise<void>;
  handleSaveSearchBoxCustomization: (customization: SearchBoxCustomization) => Promise<void>;
  handleSavePredefinedQuestions: (settings: PredefinedQuestionsSettings) => Promise<void>;
  handleRunSearchTest: (query: string) => Promise<void>;
  handleSubmitSearchTestFeedback: (payload: SearchTestFeedbackPayload) => Promise<boolean>;
  handleRegenerateScript: (key: 'web' | 'mobile') => Promise<void>;
  handleClearSearchHistory: () => Promise<void>;
  handleDeleteSearchHistorySessions: (sessionIds: string[]) => Promise<void>;
  handleDeleteSearchHistoryMessage: (messageId: string) => Promise<void>;
  handleRefreshSearchHistory: () => Promise<void>;
  handleRefreshSettingsOverview: () => Promise<void>;
  clearTestResult: () => void;
};

const SearchConfigContext = createContext<SearchConfigContextValue | null>(null);

type Props = {
  children: React.ReactNode;
};

export function SearchConfigProvider({ children }: Props) {
  const { t } = useTranslation();
  const { isReady } = useAuthenticatedBootstrap();
  const { activeProjectId } = useActiveProject();
  const [bundle, setBundle] = useState<SearchConfigBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<SearchConfigFeedback>(null);
  const [primaryTab, setPrimaryTab] = useState<SearchConfigPrimaryTab>('training');
  const [trainingSubTab, setTrainingSubTab] = useState<TrainingSubTab>('overview');
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('overview');
  const [testResult, setTestResult] = useState<SearchTestResult | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [testStreamingAnswer, setTestStreamingAnswer] = useState<string | null>(null);
  const [testStreamingSources, setTestStreamingSources] = useState<SearchTestCitation[]>([]);
  const saveLockRef = useRef(false);
  const successFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const testRequestIdRef = useRef(0);
  const streamRafRef = useRef<number | null>(null);
  const streamBufferRef = useRef<string>('');

  const notify = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setFeedback({ type, message });
  }, []);

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    if (mode === 'initial') setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const data = await fetchSearchConfigBundle();
      setBundle(data);
    } catch {
      setError(t('errors.server.description'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    configureSearchConfigProject(activeProjectId);
    setTestResult(null);
    setTestStreamingAnswer(null);
    setBundle((prev) => (prev ? { ...prev, searchHistory: [] } : prev));
  }, [activeProjectId]);

  useEffect(() => {
    if (!isReady) {
      return;
    }
    void load('initial');
  }, [isReady, activeProjectId, load]);

  useEffect(() => {
    if (!isReady || trainingSubTab !== 'history') return;
    const intervalId = setInterval(() => {
      void refreshSearchHistory().then(setBundle).catch(() => undefined);
    }, 60_000);
    return () => clearInterval(intervalId);
  }, [isReady, trainingSubTab, activeProjectId]);

  useEffect(() => {
    if (!isReady || primaryTab !== 'settings') return;
    void refreshSettingsSection(settingsSection).then(setBundle).catch(() => undefined);
  }, [isReady, primaryTab, settingsSection, activeProjectId]);

  useEffect(() => {
    if (successFeedbackTimeoutRef.current) clearTimeout(successFeedbackTimeoutRef.current);
    if (feedback?.type !== 'success') return;
    successFeedbackTimeoutRef.current = setTimeout(() => {
      setFeedback((current) => (current?.type === 'success' ? null : current));
    }, 2500);
    return () => {
      if (successFeedbackTimeoutRef.current) clearTimeout(successFeedbackTimeoutRef.current);
    };
  }, [feedback]);

  useEffect(() => {
    return () => {
      if (streamRafRef.current != null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(streamRafRef.current);
      }
    };
  }, []);

  const withSave = useCallback(
    async (action: () => Promise<SearchConfigBundle>, successMessage: string): Promise<boolean> => {
      if (saveLockRef.current) {
        notify(t('common.saving'), 'error');
        return false;
      }
      saveLockRef.current = true;
      setSaving(true);
      try {
        const data = await action();
        setBundle(data);
        notify(successMessage);
        return true;
      } catch (err) {
        notify(resolveAppErrorMessage(err, t, 'search.models.saveError.fallback'), 'error');
        return false;
      } finally {
        setSaving(false);
        saveLockRef.current = false;
      }
    },
    [notify, t],
  );

  const value = useMemo<SearchConfigContextValue>(
    () => ({
      bundle,
      loading,
      refreshing,
      saving,
      error,
      feedback,
      primaryTab,
      trainingSubTab,
      settingsSection,
      testResult,
      testLoading,
      testStreamingAnswer,
      testStreamingSources,
      setPrimaryTab,
      setTrainingSubTab,
      setSettingsSection,
      refresh: () => load('refresh'),
      clearFeedback: () => setFeedback(null),
      notify,
      handleSaveModelSettings: async (settings, options) => {
        await withSave(() => saveModelSettings(settings, options), t('search.settings.toast.saved.description'));
      },
      handleTestModelConnection: (settings, options) => testSearchModelConnection(settings, options),
      handleRefreshModelStatus: async () => {
        await withSave(() => refreshModelStatus(), t('search.embedding.status.refresh'));
      },
      handleSaveSearchStatus: async (enabled) => {
        await withSave(
          () => saveSearchStatus(enabled),
          enabled ? t('search.training.activeStatus.activeDescription') : t('search.training.activeStatus.inactiveDescription'),
        );
      },
      handleSaveSystemPrompt: async (prompt) => {
        await withSave(() => saveSystemPrompt(prompt), t('search.settings.toast.saved.description'));
      },
      handleSaveResponseConfig: async (responseType) => {
        await withSave(
          () => saveSearchResponseConfig(responseType),
          t('search.training.responseConfig.toast.description', {
            type: responseType === 'long' ? t('search.training.responseType.long') : t('search.training.responseType.short'),
          }),
        );
      },
      handleAddDomain: (domain, scope) =>
        withSave(() => addAllowedDomain(domain, scope), t('search.settings.toast.saved.description')),
      handleRemoveDomain: async (id) => {
        await withSave(() => removeAllowedDomain(id), t('search.settings.toast.saved.description'));
      },
      handleSaveCitation: async (format) => {
        await withSave(() => saveCitationFormat(format), t('search.settings.toast.saved.description'));
      },
      handleSaveSearchBoxConfig: async (config) => {
        await withSave(() => saveSearchBoxConfig(config), t('search.config.toast.saved.description'));
      },
      handleSaveSearchBoxCustomization: async (customization) => {
        await withSave(() => saveSearchBoxCustomization(customization), t('search.customisation.toast.saved.description'));
      },
      handleSavePredefinedQuestions: async (settings) => {
        await withSave(() => savePredefinedQuestions(settings), t('search.settings.toast.saved.description'));
      },
      handleRunSearchTest: async (query) => {
        if (saveLockRef.current) {
          notify(t('common.saving'), 'error');
          return;
        }
        const requestId = ++testRequestIdRef.current;
        streamBufferRef.current = '';
        if (streamRafRef.current != null && typeof cancelAnimationFrame === 'function') {
          cancelAnimationFrame(streamRafRef.current);
          streamRafRef.current = null;
        }
        setTestLoading(true);
        setTestResult(null);
        setTestStreamingAnswer(null);
        setTestStreamingSources([]);
        try {
          const result = await runSearchTest(query, {
            onToken: (_token, accumulated) => {
              if (requestId !== testRequestIdRef.current) return;
              streamBufferRef.current = accumulated;
              if (streamRafRef.current != null) return;
              if (typeof requestAnimationFrame !== 'function') {
                setTestStreamingAnswer(accumulated);
                return;
              }
              streamRafRef.current = requestAnimationFrame(() => {
                streamRafRef.current = null;
                if (requestId !== testRequestIdRef.current) return;
                setTestStreamingAnswer(streamBufferRef.current);
              });
            },
            onSources: (sources) => {
              if (requestId !== testRequestIdRef.current) return;
              setTestStreamingSources(sources);
            },
          });
          if (requestId !== testRequestIdRef.current) return;
          if (streamBufferRef.current) {
            setTestStreamingAnswer(streamBufferRef.current);
          }
          const resolvedAnswer = result.answer?.trim() || streamBufferRef.current.trim();
          setTestResult(
            resolvedAnswer && resolvedAnswer !== result.answer
              ? { ...result, answer: resolvedAnswer }
              : result,
          );
          const data = await fetchSearchConfigBundle();
          if (requestId !== testRequestIdRef.current) return;
          setBundle(data);
        } catch (err) {
          if (requestId !== testRequestIdRef.current) return;
          notify(resolveAppErrorMessage(err, t, 'search.test.error.unknown'), 'error');
        } finally {
          if (requestId === testRequestIdRef.current) setTestLoading(false);
        }
      },
      handleSubmitSearchTestFeedback: async (payload) => {
        try {
          await submitSearchTestFeedback(payload);
          notify(t('feedbackModeration.toast.saved'), 'success');
          return true;
        } catch (err) {
          notify(resolveAppErrorMessage(err, t, 'feedbackModeration.toast.saveFailed'), 'error');
          return false;
        }
      },
      handleRegenerateScript: async (key) => {
        await withSave(
          () => regenerateIntegrationScript(key),
          key === 'web'
            ? t('search.integrations.web.regenerate.description')
            : t('search.integrations.mobile.regenerate'),
        );
      },
      handleClearSearchHistory: async () => {
        await withSave(() => clearSearchHistory(), t('search.history.deleteAll.description'));
      },
      handleDeleteSearchHistorySessions: async (sessionIds) => {
        if (!sessionIds.length) return;
        await withSave(
          () => deleteSearchHistoryBySessions(sessionIds),
          t('search.history.deleteSelected.description', { count: sessionIds.length }),
        );
      },
      handleDeleteSearchHistoryMessage: async (messageId) => {
        await withSave(() => deleteSearchMessage(messageId), t('search.history.deleteConversation.description'));
      },
      handleRefreshSearchHistory: async () => {
        try {
          const data = await refreshSearchHistory();
          setBundle(data);
        } catch {
          notify(t('search.history.loadError'), 'error');
        }
      },
      handleRefreshSettingsOverview: async () => {
        try {
          const data = await refreshSettingsOverview();
          setBundle(data);
        } catch {
          notify(t('errors.server.description'), 'error');
        }
      },
      clearTestResult: () => {
        setTestResult(null);
        setTestStreamingAnswer(null);
        setTestStreamingSources([]);
      },
    }),
    [
      bundle,
      loading,
      refreshing,
      saving,
      error,
      feedback,
      primaryTab,
      trainingSubTab,
      settingsSection,
      testResult,
      testLoading,
      testStreamingAnswer,
      testStreamingSources,
      load,
      notify,
      withSave,
      t,
    ],
  );

  return <SearchConfigContext.Provider value={value}>{children}</SearchConfigContext.Provider>;
}

export function useSearchConfig() {
  const ctx = useContext(SearchConfigContext);
  if (!ctx) throw new Error('useSearchConfig must be used within SearchConfigProvider');
  return ctx;
}
