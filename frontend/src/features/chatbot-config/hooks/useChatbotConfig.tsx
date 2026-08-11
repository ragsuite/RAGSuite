import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useAuthenticatedBootstrap } from '@/features/auth/hooks/use-authenticated-bootstrap';
import {
    addAllowedDomain,
    configureChatbotConfigProject,
    deleteAllChatHistory,
    deleteChatHistory,
    exportChatbotHistory,
    fetchChatbotConfigBundle,
    refreshChatHistory,
    refreshModelStatus,
    refreshSettingsSection,
    regenerateIntegrationScript,
    removeAllowedDomain,
    saveActiveConfig,
    saveChatWidgetConfig,
    saveChatWidgetCustomization,
    saveFeedbackSettings,
    saveModelSettings,
    saveSystemPrompt,
    testModelConnection,
    type ModelConnectionTestResult,
} from '@/features/chatbot-config/services/chatbot-config.service';
import type {
    ActiveTrainingConfig,
    ChatWidgetConfig,
    ChatWidgetCustomization,
    ChatbotConfigBundle,
    ChatbotConfigFeedback,
    ChatbotConfigPrimaryTab,
    DomainScope,
    FeedbackSettings,
    HistoryTimeRange,
    ModelSettings,
    SettingsSection,
    TrainingSubTab,
} from '@/features/chatbot-config/types/chatbot-config.types';
import {
    filterConversationsBySearch,
    filterConversationsByTimeRange,
} from '@/features/chatbot-config/utils/chat-history-mapper';
import { useActiveProject } from '@/features/projects/providers/active-project-provider';
import { resolveAppErrorMessage, useTranslation } from '@/i18n';
import { notifyAdminChatSessionsDeleted } from '@/shared/utils/admin-chat-sync';

type ChatbotConfigContextValue = {
  bundle: ChatbotConfigBundle | null;
  loading: boolean;
  refreshing: boolean;
  saving: boolean;
  error: string | null;
  feedback: ChatbotConfigFeedback;
  primaryTab: ChatbotConfigPrimaryTab;
  trainingSubTab: TrainingSubTab;
  settingsSection: SettingsSection;
  selectedSessionId: string | null;
  selectedSessionIds: string[];
  historySearch: string;
  historyTimeRange: HistoryTimeRange;
  filteredConversations: ChatbotConfigBundle['conversations'];
  selectedConversation: ChatbotConfigBundle['conversations'][number] | null;
  setPrimaryTab: (tab: ChatbotConfigPrimaryTab) => void;
  setTrainingSubTab: (tab: TrainingSubTab) => void;
  setSettingsSection: (section: SettingsSection) => void;
  setSelectedSessionId: (sessionId: string | null) => void;
  setHistorySearch: (query: string) => void;
  setHistoryTimeRange: (range: HistoryTimeRange) => void;
  toggleSessionSelection: (sessionId: string) => void;
  selectAllVisibleSessions: (sessionIds: string[]) => void;
  clearSessionSelection: () => void;
  refresh: () => Promise<void>;
  clearFeedback: () => void;
  notify: (message: string, type?: 'success' | 'error') => void;
  handleSaveModelSettings: (settings: ModelSettings) => Promise<void>;
  handleTestModelConnection: (
    settings: Pick<ModelSettings, 'provider' | 'chatModel' | 'embeddingModel' | 'apiKey'>,
    options?: { hasSavedApiKey?: boolean },
  ) => Promise<ModelConnectionTestResult>;
  handleRefreshModelStatus: () => Promise<void>;
  handleSaveActiveConfig: (patch: Partial<ActiveTrainingConfig>) => Promise<void>;
  handleSaveSystemPrompt: (prompt: string) => Promise<void>;
  handleAddDomain: (domain: string, scope?: DomainScope) => Promise<boolean>;
  handleRemoveDomain: (id: string) => Promise<void>;
  handleSaveChatWidgetConfig: (config: ChatWidgetConfig) => Promise<void>;
  handleSaveChatWidgetCustomization: (
    customization: ChatWidgetCustomization,
    config?: ChatWidgetConfig,
  ) => Promise<void>;
  handleSaveFeedbackSettings: (settings: FeedbackSettings) => Promise<void>;
  handleDeleteConversation: (sessionId: string) => Promise<void>;
  handleDeleteSelectedConversations: () => Promise<void>;
  handleClearChatHistory: () => Promise<void>;
  handleExportChatHistory: (fmt: 'csv' | 'json') => Promise<string>;
  handleRegenerateScript: (variant: 'web' | 'mobile') => Promise<void>;
};

const ChatbotConfigContext = createContext<ChatbotConfigContextValue | null>(null);

type Props = {
  children: React.ReactNode;
};

export function ChatbotConfigProvider({ children }: Props) {
  const { t } = useTranslation();
  const { isReady } = useAuthenticatedBootstrap();
  const { activeProjectId } = useActiveProject();
  const [bundle, setBundle] = useState<ChatbotConfigBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<ChatbotConfigFeedback>(null);
  const [primaryTab, setPrimaryTab] = useState<ChatbotConfigPrimaryTab>('training');
  const [trainingSubTab, setTrainingSubTab] = useState<TrainingSubTab>('overview');
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('overview');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);
  const [historySearch, setHistorySearch] = useState('');
  const [historyTimeRange, setHistoryTimeRange] = useState<HistoryTimeRange>('all');
  const saveLockRef = useRef(false);
  const settingsRefreshGenRef = useRef(0);
  const successFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setFeedback({ type, message });
  }, []);

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    if (mode === 'initial') setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const data = await fetchChatbotConfigBundle();
      setBundle(data);
      setSelectedSessionId((current) => {
        if (!current) return current;
        return data.conversations.some((c) => c.sessionId === current) ? current : null;
      });
    } catch {
      setError(t('errors.server.description'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    configureChatbotConfigProject(activeProjectId);
    setSelectedSessionId(null);
    setSelectedSessionIds([]);
    setBundle((prev) =>
      prev
        ? {
            ...prev,
            conversations: [],
            chatHistory: [],
          }
        : prev,
    );
  }, [activeProjectId]);

  useEffect(() => {
    if (!isReady) {
      return;
    }
    void load('initial');
  }, [isReady, activeProjectId, load]);

  useEffect(() => {
    // Load once when entering Training history/overview — no timed auto-refresh
    // (periodic refresh was yanking UI / feeling like a reload while reading).
    if (!isReady || (trainingSubTab !== 'history' && trainingSubTab !== 'overview')) return;
    void refreshChatHistory().then(setBundle).catch(() => undefined);
  }, [isReady, trainingSubTab, activeProjectId]);

  useEffect(() => {
    if (!isReady || primaryTab !== 'settings') return;
    const gen = ++settingsRefreshGenRef.current;
    void refreshSettingsSection(settingsSection)
      .then((data) => {
        if (gen === settingsRefreshGenRef.current) setBundle(data);
      })
      .catch(() => undefined);
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

  const filteredConversations = useMemo(() => {
    if (!bundle?.conversations) return [];
    const byTime = filterConversationsByTimeRange(bundle.conversations, historyTimeRange);
    return filterConversationsBySearch(byTime, historySearch);
  }, [bundle?.conversations, historySearch, historyTimeRange]);

  const selectedConversation = useMemo(() => {
    if (!selectedSessionId || !bundle?.conversations) return null;
    return bundle.conversations.find((c) => c.sessionId === selectedSessionId) ?? null;
  }, [bundle?.conversations, selectedSessionId]);

  const withSave = useCallback(
    async (action: () => Promise<ChatbotConfigBundle>, successMessage: string): Promise<boolean> => {
      if (saveLockRef.current) {
        notify(t('common.saving'), 'error');
        return false;
      }
      saveLockRef.current = true;
      setSaving(true);
      settingsRefreshGenRef.current += 1;
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

  const toggleSessionSelection = useCallback((sessionId: string) => {
    setSelectedSessionIds((prev) =>
      prev.includes(sessionId) ? prev.filter((id) => id !== sessionId) : [...prev, sessionId],
    );
  }, []);

  const selectAllVisibleSessions = useCallback((sessionIds: string[]) => {
    setSelectedSessionIds(sessionIds);
  }, []);

  const clearSessionSelection = useCallback(() => {
    setSelectedSessionIds([]);
  }, []);

  const value = useMemo<ChatbotConfigContextValue>(
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
      selectedSessionId,
      selectedSessionIds,
      historySearch,
      historyTimeRange,
      filteredConversations,
      selectedConversation,
      setPrimaryTab,
      setTrainingSubTab,
      setSettingsSection,
      setSelectedSessionId,
      setHistorySearch,
      setHistoryTimeRange,
      toggleSessionSelection,
      selectAllVisibleSessions,
      clearSessionSelection,
      refresh: () => load('refresh'),
      clearFeedback: () => setFeedback(null),
      notify,
      handleSaveModelSettings: async (settings) => {
        await withSave(() => saveModelSettings(settings), t('chatbot.toast.settingsSaved.description'));
      },
      handleTestModelConnection: async (settings, options) => {
        setSaving(true);
        try {
          const result = await testModelConnection(settings, options);
          notify(result.message, result.ok ? 'success' : 'error');
          return result;
        } catch (err) {
          const message = resolveAppErrorMessage(err, t, 'models.apiKey.test.invalidKey');
          notify(message, 'error');
          return { ok: false, message };
        } finally {
          setSaving(false);
        }
      },
      handleRefreshModelStatus: async () => {
        await withSave(() => refreshModelStatus(), t('chatbot.embedding.status.refresh'));
      },
      handleSaveActiveConfig: async (patch) => {
        await withSave(() => saveActiveConfig(patch), t('chatbot.toast.settingsSaved.description'));
      },
      handleSaveSystemPrompt: async (prompt) => {
        await withSave(() => saveSystemPrompt(prompt), t('chatbot.toast.settingsSaved.description'));
      },
      handleAddDomain: (domain, scope) =>
        withSave(() => addAllowedDomain(domain, scope), t('chatbot.toast.settingsSaved.description')),
      handleRemoveDomain: async (id) => {
        await withSave(() => removeAllowedDomain(id), t('chatbot.toast.settingsSaved.description'));
      },
      handleSaveChatWidgetConfig: async (config) => {
        await withSave(() => saveChatWidgetConfig(config), t('chatbot.toast.settingsSaved.description'));
      },
      handleSaveChatWidgetCustomization: async (customization, config) => {
        await withSave(
          () => saveChatWidgetCustomization(customization, config),
          t('chatbot.toast.settingsSaved.description'),
        );
      },
      handleSaveFeedbackSettings: async (settings) => {
        await withSave(() => saveFeedbackSettings(settings), t('chatbot.toast.settingsSaved.description'));
      },
      handleDeleteConversation: async (sessionId) => {
        const ok = await withSave(
          () => deleteChatHistory([sessionId]),
          t('chatbot.toast.deleteConversation.description'),
        );
        if (ok) {
          notifyAdminChatSessionsDeleted([sessionId], activeProjectId);
          setSelectedSessionId((current) => (current === sessionId ? null : current));
          setSelectedSessionIds((prev) => prev.filter((id) => id !== sessionId));
        }
      },
      handleDeleteSelectedConversations: async () => {
        const ids = [...selectedSessionIds];
        if (!ids.length) return;
        const ok = await withSave(
          () => deleteChatHistory(ids),
          t('chatbot.toast.deleteAll.description', { count: ids.length }),
        );
        if (ok) {
          notifyAdminChatSessionsDeleted(ids, activeProjectId);
          setSelectedSessionIds([]);
          setSelectedSessionId((current) => (current && ids.includes(current) ? null : current));
        }
      },
      handleClearChatHistory: async () => {
        const ids = bundle?.conversations.map((conversation) => conversation.sessionId) ?? [];
        const ok = await withSave(() => deleteAllChatHistory(), t('chatbot.toast.deleteAll.description', { count: 0 }));
        if (ok) {
          if (ids.length > 0) notifyAdminChatSessionsDeleted(ids, activeProjectId);
          setSelectedSessionId(null);
          setSelectedSessionIds([]);
        }
      },
      handleExportChatHistory: (fmt) => exportChatbotHistory(fmt, historySearch),
      handleRegenerateScript: async (variant) => {
        const message =
          variant === 'web'
            ? t('chatbot.integrations.web.regenerate.description')
            : t('chatbot.integrations.mobile.regenerate');
        await withSave(() => regenerateIntegrationScript(variant), message);
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
      selectedSessionId,
      selectedSessionIds,
      historySearch,
      historyTimeRange,
      filteredConversations,
      selectedConversation,
      load,
      notify,
      withSave,
      toggleSessionSelection,
      selectAllVisibleSessions,
      clearSessionSelection,
      activeProjectId,
      historySearch,
      t,
    ],
  );

  return <ChatbotConfigContext.Provider value={value}>{children}</ChatbotConfigContext.Provider>;
}

export function useChatbotConfig() {
  const ctx = useContext(ChatbotConfigContext);
  if (!ctx) throw new Error('useChatbotConfig must be used within ChatbotConfigProvider');
  return ctx;
}
