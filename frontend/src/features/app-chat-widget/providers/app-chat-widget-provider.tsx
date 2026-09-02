import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import {
  clearAppChatSession,
  configureAppChatWidgetProject,
  loadAppChatSessionHistory,
  mapHistoryRowsToMessages,
  resolveChatErrorMessage,
  streamAppChatMessage,
  submitAppChatFeedback,
} from '@/features/app-chat-widget/services/app-chat-widget.service';
import type { AppChatMessage } from '@/features/app-chat-widget/types/app-chat-widget.types';
import { createChatMessageId } from '@/features/app-chat-widget/utils/app-chat-widget-display';
import type {
  AppChatWidgetFeedbackDraft,
  AppChatWidgetFeedbackSentiment,
} from '@/features/app-chat-widget/utils/app-chat-widget-feedback-options';
import {
  generateChatSessionId,
  getDashboardChatSessionKey,
  getEmbedChatSessionKey,
  hydrateStoredSessionId,
  writeStoredSessionId,
} from '@/features/app-chat-widget/utils/app-chat-widget-session';
import {
  createWelcomeMessage,
  isWelcomeMessage,
} from '@/features/app-chat-widget/utils/app-chat-widget-welcome';
import { preferStreamedContentForTts } from '@/features/app-chat-widget/utils/prefer-streamed-content-for-tts';
import {
  configureChatbotConfigProject,
  fetchChatWidgetSettings,
} from '@/features/chatbot-config/services/chatbot-config.service';
import { useChatbotConfig } from '@/features/chatbot-config/hooks/useChatbotConfig';
import { useActiveProject } from '@/features/projects/providers/active-project-provider';
import type { AvatarOption, ChatWidgetConfig, ChatWidgetCustomization } from '@/features/chatbot-config/types/chatbot-config.types';
import { buildDefaultAvatarOptions } from '@/features/chatbot-config/utils/chatbot-api-mappers';
import { withResolvedWidgetAvatarCustomization } from '@/features/chatbot-config/utils/widget-avatar-display';
import { useTranslation } from '@/i18n';
import type { FeedbackReasonKey } from '@/shared/constants/feedback-reason-keys';
import { subscribeAdminChatSessionsDeleted } from '@/shared/utils/admin-chat-sync';

type AppChatWidgetContextValue = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  config: ChatWidgetConfig | null;
  customization: ChatWidgetCustomization | null;
  displayCustomization: ChatWidgetCustomization | null;
  avatarOptions: AvatarOption[];
  collectFeedback: boolean;
  chatbotActive: boolean;
  settingsLoading: boolean;
  historyLoading: boolean;
  messages: AppChatMessage[];
  sending: boolean;
  isTyping: boolean;
  isStreaming: boolean;
  streamingContent: string;
  streamSlow: boolean;
  draft: string;
  setDraft: (value: string) => void;
  sendMessage: (textOverride?: string) => Promise<void>;
  clearConversation: () => Promise<void>;
  reloadSettings: () => Promise<void>;
  syncFromBundle: (payload: {
    config: ChatWidgetConfig;
    customization: ChatWidgetCustomization;
    collectFeedback: boolean;
    chatbotActive?: boolean;
    avatarOptions?: AvatarOption[];
  }) => void;
  messageFeedback: Record<string, 'up' | 'down' | null>;
  setMessageFeedback: (messageId: string, value: 'up' | 'down' | null) => void;
  feedbackDraft: AppChatWidgetFeedbackDraft | null;
  feedbackSubmitting: boolean;
  openMessageFeedback: (messageId: string, sentiment: AppChatWidgetFeedbackSentiment) => void;
  closeMessageFeedback: () => void;
  submitMessageFeedback: (payload: {
    rating: number;
    reasons: FeedbackReasonKey[];
    comments: string;
  }) => Promise<void>;
  /** Persist scroll across Modal remounts (pass-through hosts keep ScrollView alive). */
  scrollOffsetYRef: React.MutableRefObject<number>;
};

const AppChatWidgetContext = createContext<AppChatWidgetContextValue | null>(null);

type Props = {
  children: React.ReactNode;
  /** Third-party script embed — skips admin SettingsSync and uses embed session keys. */
  mode?: 'dashboard' | 'embed';
  /** Optional session id seeded from the host page (legacy localStorage). */
  initialSessionId?: string | null;
};

function AppChatWidgetSettingsSync() {
  const { bundle } = useChatbotConfig();
  const { syncFromBundle } = useAppChatWidget();
  const syncedKeyRef = useRef('');

  useEffect(() => {
    if (!bundle?.chatWidgetConfig || !bundle?.chatWidgetCustomization) return;

    const key = JSON.stringify([
      bundle.chatWidgetConfig,
      bundle.chatWidgetCustomization,
      bundle.feedbackSettings.collectFeedback,
      bundle.activeConfig?.chatbotActive,
    ]);
    if (syncedKeyRef.current === key) return;
    syncedKeyRef.current = key;

    syncFromBundle({
      config: bundle.chatWidgetConfig,
      customization: bundle.chatWidgetCustomization,
      collectFeedback: bundle.feedbackSettings.collectFeedback,
      chatbotActive: bundle.activeConfig?.chatbotActive,
      avatarOptions: bundle.avatarOptions,
    });
  }, [
    bundle?.chatWidgetConfig,
    bundle?.chatWidgetCustomization,
    bundle?.feedbackSettings.collectFeedback,
    bundle?.activeConfig?.chatbotActive,
    bundle?.avatarOptions,
    syncFromBundle,
  ]);

  return null;
}

export function AppChatWidgetProvider({
  children,
  mode = 'dashboard',
  initialSessionId = null,
}: Props) {
  const { t } = useTranslation();
  const defaultWelcomeText = t('chatbot.config.defaultWelcomeMessage');
  const { activeProjectId } = useActiveProject();
  const isEmbed = mode === 'embed';
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<ChatWidgetConfig | null>(null);
  const [customization, setCustomization] = useState<ChatWidgetCustomization | null>(null);
  const [avatarOptions, setAvatarOptions] = useState<AvatarOption[]>(buildDefaultAvatarOptions());
  const [collectFeedback, setCollectFeedback] = useState(true);
  const [chatbotActive, setChatbotActive] = useState(true);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [messages, setMessages] = useState<AppChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamSlow, setStreamSlow] = useState(false);
  const [draft, setDraft] = useState('');
  const [messageFeedback, setMessageFeedbackState] = useState<Record<string, 'up' | 'down' | null>>({});
  const [feedbackDraft, setFeedbackDraft] = useState<AppChatWidgetFeedbackDraft | null>(null);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const sessionIdRef = useRef<string | undefined>(undefined);
  const skipNextHistoryLoadRef = useRef(false);
  const historyHydratedSessionIdRef = useRef<string | null>(null);
  const messagesRef = useRef<AppChatMessage[]>([]);
  const scrollOffsetYRef = useRef(0);
  const sessionStorageKeyRef = useRef<string | null>(null);
  const activeStreamAbortRef = useRef<AbortController | null>(null);
  const activeRequestIdRef = useRef(0);
  const seededSessionRef = useRef(false);
  const configRefHasSettings = useRef(false);

  messagesRef.current = messages;

  useEffect(() => {
    configureAppChatWidgetProject(activeProjectId);
    configureChatbotConfigProject(activeProjectId);
    let cancelled = false;

    if (!activeProjectId) {
      sessionStorageKeyRef.current = null;
      sessionIdRef.current = undefined;
      historyHydratedSessionIdRef.current = null;
      configRefHasSettings.current = false;
      return;
    }

    const storageKey = isEmbed
      ? getEmbedChatSessionKey(activeProjectId)
      : getDashboardChatSessionKey(activeProjectId);
    sessionStorageKeyRef.current = storageKey;
    // Clear immediately so a fast open cannot send the previous project's session.
    sessionIdRef.current = undefined;
    historyHydratedSessionIdRef.current = null;
    configRefHasSettings.current = false;

    void hydrateStoredSessionId(storageKey).then((stored) => {
      if (cancelled) return;
      const seeded =
        isEmbed && !seededSessionRef.current && initialSessionId?.trim()
          ? initialSessionId.trim()
          : undefined;
      if (seeded) {
        seededSessionRef.current = true;
        sessionIdRef.current = seeded;
        writeStoredSessionId(storageKey, seeded);
        return;
      }
      sessionIdRef.current = stored;
    });

    return () => {
      cancelled = true;
    };
  }, [activeProjectId, initialSessionId, isEmbed]);

  const reloadSettings = useCallback(async () => {
    // Only flash the loading shell on first load — silent refresh avoids mid-read jumps.
    const showLoading = !configRefHasSettings.current;
    if (showLoading) setSettingsLoading(true);
    try {
      const settings = await fetchChatWidgetSettings();
      configRefHasSettings.current = true;
      setConfig(settings.config);
      setCustomization(settings.customization);
      setAvatarOptions(settings.avatarOptions);
      setChatbotActive(settings.chatbotActive);
    } finally {
      if (showLoading) setSettingsLoading(false);
    }
  }, []);

  const loadSessionHistory = useCallback(async () => {
    if (sessionStorageKeyRef.current) {
      const stored = await hydrateStoredSessionId(sessionStorageKeyRef.current);
      // Always apply hydrate result — clear stale id when this project has no session.
      sessionIdRef.current = stored;
    }

    const sessionId = sessionIdRef.current;
    if (!sessionId || skipNextHistoryLoadRef.current) {
      skipNextHistoryLoadRef.current = false;
      return;
    }

    // Reopen with in-memory transcript — skip remount that regenerates message IDs.
    if (
      historyHydratedSessionIdRef.current === sessionId &&
      messagesRef.current.some((message) => !isWelcomeMessage(message))
    ) {
      return;
    }

    setHistoryLoading(true);
    try {
      const rows = await loadAppChatSessionHistory(sessionId);
      if (sessionIdRef.current !== sessionId) return;
      const pairs = mapHistoryRowsToMessages(rows);
      const welcome = config ? createWelcomeMessage(config, defaultWelcomeText) : null;
      const restored: AppChatMessage[] = pairs.flatMap((pair, index) => {
        const pairKey = pair.assistant.serverMessageId || `${pair.user.createdAt}-${index}`;
        return [
          {
            id: `user-${pairKey}`,
            role: 'user' as const,
            content: pair.user.content,
            createdAt: pair.user.createdAt,
          },
          {
            id: pair.assistant.serverMessageId || `assistant-${pairKey}`,
            serverMessageId: pair.assistant.serverMessageId,
            role: 'assistant' as const,
            content: pair.assistant.content,
            createdAt: pair.assistant.createdAt,
            sources: pair.assistant.sources,
          },
        ];
      });

      if (welcome) {
        setMessages(restored.length > 0 ? [welcome, ...restored] : [welcome]);
      } else {
        setMessages(restored);
      }
      historyHydratedSessionIdRef.current = sessionId;
    } catch (err) {
      const errorText = resolveChatErrorMessage(err);
      const welcome = config ? createWelcomeMessage(config, defaultWelcomeText) : null;
      setMessages(
        welcome
          ? [
              welcome,
              {
                id: createChatMessageId('assistant'),
                role: 'assistant',
                content: errorText,
                createdAt: new Date().toISOString(),
                error: true,
              },
            ]
          : [
              {
                id: createChatMessageId('assistant'),
                role: 'assistant',
                content: errorText,
                createdAt: new Date().toISOString(),
                error: true,
              },
            ],
      );
    } finally {
      setHistoryLoading(false);
    }
  }, [config, defaultWelcomeText]);

  const syncFromBundle = useCallback(
    (payload: {
      config: ChatWidgetConfig;
      customization: ChatWidgetCustomization;
      collectFeedback: boolean;
      chatbotActive?: boolean;
      avatarOptions?: AvatarOption[];
    }) => {
      setConfig(payload.config);
      setCustomization(payload.customization);
      if (payload.avatarOptions?.length) {
        setAvatarOptions(payload.avatarOptions);
      }
      setCollectFeedback(payload.collectFeedback);
      if (payload.chatbotActive !== undefined) {
        setChatbotActive(payload.chatbotActive);
      }
      setSettingsLoading(false);
    },
    [],
  );

  const displayCustomization = useMemo(() => {
    if (!customization) return null;
    return withResolvedWidgetAvatarCustomization(customization, avatarOptions);
  }, [avatarOptions, customization]);

  useEffect(() => {
    if (!config) return;
    setMessages((prev) => {
      const welcome = createWelcomeMessage(config, defaultWelcomeText);
      if (prev.length === 0) {
        return [welcome];
      }
      if (prev[0] && isWelcomeMessage(prev[0])) {
        if (prev[0].content === welcome.content) return prev;
        return [{ ...prev[0], content: welcome.content }, ...prev.slice(1)];
      }
      return prev;
    });
  }, [config, defaultWelcomeText, config?.welcomeMessage, config?.greeting]);

  useEffect(() => {
    void reloadSettings();
  }, [reloadSettings]);

  useEffect(() => {
    return subscribeAdminChatSessionsDeleted((detail) => {
      if (detail.projectId && detail.projectId !== activeProjectId) return;
      const current = sessionIdRef.current;
      if (!current || !detail.sessionIds.includes(current)) return;
      const welcome = config ? createWelcomeMessage(config, defaultWelcomeText) : null;
      setMessages(welcome ? [welcome] : []);
      setMessageFeedbackState({});
      setFeedbackDraft(null);
      sessionIdRef.current = generateChatSessionId();
      if (sessionStorageKeyRef.current) {
        writeStoredSessionId(sessionStorageKeyRef.current, sessionIdRef.current);
      }
    });
  }, [activeProjectId, config, defaultWelcomeText]);

  const open = useCallback(() => {
    setIsOpen(true);
    void reloadSettings();
    void loadSessionHistory();
  }, [loadSessionHistory, reloadSettings]);

  const close = useCallback(() => {
    setIsOpen(false);
    setFeedbackDraft(null);
  }, []);

  useEffect(() => {
    if (!chatbotActive) {
      close();
    }
  }, [chatbotActive, close]);

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      if (next) {
        void reloadSettings();
        void loadSessionHistory();
      }
      return next;
    });
  }, [loadSessionHistory, reloadSettings]);

  const clearConversation = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    if (sessionId) {
      try {
        await clearAppChatSession(sessionId);
      } catch {
        // Local reset still proceeds if API delete fails.
      }
    }
    setMessages(config ? [createWelcomeMessage(config, defaultWelcomeText)] : []);
    setMessageFeedbackState({});
    setFeedbackDraft(null);
    setDraft('');
    setIsTyping(false);
    setIsStreaming(false);
    setStreamingContent('');
    setStreamSlow(false);
    historyHydratedSessionIdRef.current = null;
    scrollOffsetYRef.current = 0;
    const nextSessionId = generateChatSessionId();
    sessionIdRef.current = nextSessionId;
    if (sessionStorageKeyRef.current) {
      writeStoredSessionId(sessionStorageKeyRef.current, nextSessionId);
    }
  }, [config, defaultWelcomeText]);

  const setMessageFeedback = useCallback((messageId: string, value: 'up' | 'down' | null) => {
    setMessageFeedbackState((prev) => ({ ...prev, [messageId]: value }));
  }, []);

  const openMessageFeedback = useCallback((messageId: string, sentiment: AppChatWidgetFeedbackSentiment) => {
    setFeedbackDraft((current) => {
      if (current?.messageId === messageId && current.sentiment === sentiment) {
        return null;
      }
      return { messageId, sentiment };
    });
  }, []);

  const closeMessageFeedback = useCallback(() => {
    if (feedbackSubmitting) return;
    setFeedbackDraft(null);
  }, [feedbackSubmitting]);

  const submitMessageFeedback = useCallback(
    async (payload: { rating: number; reasons: FeedbackReasonKey[]; comments: string }) => {
      if (!feedbackDraft) return;
      const target = messages.find((message) => message.id === feedbackDraft.messageId);
      const messageId = target?.serverMessageId ?? feedbackDraft.messageId;
      setFeedbackSubmitting(true);
      try {
        await submitAppChatFeedback({
          messageId,
          sessionId: sessionIdRef.current,
          sentiment: feedbackDraft.sentiment,
          rating: payload.rating,
          reasons: payload.reasons,
          comments: payload.comments,
        });
        setMessageFeedbackState((prev) => ({
          ...prev,
          [feedbackDraft.messageId]: feedbackDraft.sentiment === 'positive' ? 'up' : 'down',
        }));
        setFeedbackDraft(null);
      } finally {
        setFeedbackSubmitting(false);
      }
    },
    [feedbackDraft, messages],
  );

  const sendMessage = useCallback(async (textOverride?: string) => {
    const trimmed = (textOverride ?? draft).trim();
    if (!trimmed || sending) return;

    if (!sessionIdRef.current) {
      sessionIdRef.current = generateChatSessionId();
    }

    // Cancel any in-flight stream so reconnects / double-sends do not duplicate work.
    activeStreamAbortRef.current?.abort();
    const abortController = new AbortController();
    activeStreamAbortRef.current = abortController;
    const requestId = activeRequestIdRef.current + 1;
    activeRequestIdRef.current = requestId;

    const userMessage: AppChatMessage = {
      id: createChatMessageId('user'),
      role: 'user',
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    // Stable id for the assistant row so VoiceOutputControl does not remount at stream end.
    const assistantId = createChatMessageId('assistant');

    setDraft('');
    // Optimistic: keep the user message visible even if the SSE stream stalls or drops.
    setMessages((prev) => [...prev, userMessage]);
    setSending(true);
    setIsTyping(true);
    setIsStreaming(false);
    setStreamingContent('');
    setStreamSlow(false);

    const STREAM_SLOW_MS = 60_000;
    const STREAM_TIMEOUT_MS = 120_000;
    let pendingContent: string | null = null;
    let latestStreamed = '';
    let rafId: number | null = null;
    let receivedFirstToken = false;

    const upsertStreamingAssistant = (content: string, streaming: boolean) => {
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === assistantId);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], content, streaming };
          return next;
        }
        return [
          ...prev,
          {
            id: assistantId,
            role: 'assistant' as const,
            content,
            createdAt: new Date().toISOString(),
            streaming,
          },
        ];
      });
    };

    const flushStreamingContent = () => {
      rafId = null;
      if (pendingContent != null) {
        setStreamingContent(pendingContent);
        upsertStreamingAssistant(pendingContent, true);
        pendingContent = null;
      }
    };

    const slowTimer = setTimeout(() => {
      if (activeRequestIdRef.current !== requestId || abortController.signal.aborted) return;
      setStreamSlow(true);
    }, STREAM_SLOW_MS);

    const timeoutTimer = setTimeout(() => {
      if (activeRequestIdRef.current !== requestId || abortController.signal.aborted) return;
      abortController.abort();
    }, STREAM_TIMEOUT_MS);

    try {
      const result = await streamAppChatMessage(
        trimmed,
        sessionIdRef.current,
        {
          onTyping: () => {
            if (activeRequestIdRef.current !== requestId) return;
            setIsTyping(false);
            setIsStreaming(true);
          },
          onToken: (content) => {
            if (activeRequestIdRef.current !== requestId) return;
            receivedFirstToken = true;
            latestStreamed = content;
            setIsTyping(false);
            setIsStreaming(true);
            setStreamSlow(false);
            // Match reference EmbeddableWidget: RAF-throttle token UI updates (~60fps).
            pendingContent = content;
            if (typeof requestAnimationFrame === 'function') {
              if (rafId == null) {
                rafId = requestAnimationFrame(flushStreamingContent);
              }
            } else {
              setStreamingContent(content);
              upsertStreamingAssistant(content, true);
            }
          },
          onSlow: () => {
            if (activeRequestIdRef.current !== requestId) return;
            setStreamSlow(true);
          },
        },
        { signal: abortController.signal },
      );

      if (activeRequestIdRef.current !== requestId) return;

      if (rafId != null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (pendingContent != null) {
        setStreamingContent(pendingContent);
        upsertStreamingAssistant(pendingContent, true);
        pendingContent = null;
      }

      sessionIdRef.current = result.sessionId;
      historyHydratedSessionIdRef.current = result.sessionId;
      skipNextHistoryLoadRef.current = true;
      if (sessionStorageKeyRef.current) {
        writeStoredSessionId(sessionStorageKeyRef.current, result.sessionId);
      }

      // Prefer streamed when final polish diverges; use final only when it equals/extends streamed.
      const streamedPlain = (latestStreamed || pendingContent || '').trim();
      const finalAnswer = result.answer?.trim() || streamedPlain;
      const contentForMessage = preferStreamedContentForTts(streamedPlain, finalAnswer);

      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === assistantId);
        const finalized: AppChatMessage = {
          id: assistantId,
          serverMessageId: result.messageId,
          role: 'assistant',
          content: contentForMessage,
          createdAt: new Date().toISOString(),
          sources: result.sources,
          streaming: false,
        };
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], ...finalized };
          return next;
        }
        return [...prev, finalized];
      });
    } catch (err) {
      if (activeRequestIdRef.current !== requestId) return;

      if (rafId != null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafId);
        rafId = null;
      }

      const partial = (pendingContent ?? latestStreamed ?? '').trim();
      const aborted = abortController.signal.aborted;
      const errorText = aborted
        ? partial
          ? `${partial}\n\n(Response timed out after 2 minutes. You can retry your question.)`
          : 'Request timed out after 2 minutes. Please try again.'
        : resolveChatErrorMessage(err);

      // Keep any partial stream content so the answer does not vanish on disconnect.
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === assistantId);
        const errorMessage: AppChatMessage = {
          id: assistantId,
          role: 'assistant',
          content: partial && !aborted ? `${partial}\n\n(${errorText})` : errorText,
          createdAt: new Date().toISOString(),
          error: true,
          streaming: false,
        };
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], ...errorMessage };
          return next;
        }
        return [...prev, errorMessage];
      });
      void receivedFirstToken;
    } finally {
      clearTimeout(slowTimer);
      clearTimeout(timeoutTimer);
      if (activeRequestIdRef.current === requestId) {
        setSending(false);
        setIsTyping(false);
        setIsStreaming(false);
        setStreamingContent('');
        setStreamSlow(false);
        if (activeStreamAbortRef.current === abortController) {
          activeStreamAbortRef.current = null;
        }
      }
    }
  }, [draft, sending]);

  const value = useMemo(
    () => ({
      isOpen,
      open,
      close,
      toggle,
      config,
      customization,
      displayCustomization,
      avatarOptions,
      collectFeedback,
      chatbotActive,
      settingsLoading,
      historyLoading,
      messages,
      sending,
      isTyping,
      isStreaming,
      streamingContent,
      streamSlow,
      draft,
      setDraft,
      sendMessage,
      clearConversation,
      reloadSettings,
      syncFromBundle,
      messageFeedback,
      setMessageFeedback,
      feedbackDraft,
      feedbackSubmitting,
      openMessageFeedback,
      closeMessageFeedback,
      submitMessageFeedback,
      scrollOffsetYRef,
    }),
    [
      isOpen,
      open,
      close,
      toggle,
      config,
      customization,
      displayCustomization,
      avatarOptions,
      collectFeedback,
      chatbotActive,
      settingsLoading,
      historyLoading,
      messages,
      sending,
      isTyping,
      isStreaming,
      streamingContent,
      streamSlow,
      draft,
      sendMessage,
      clearConversation,
      reloadSettings,
      syncFromBundle,
      messageFeedback,
      setMessageFeedback,
      feedbackDraft,
      feedbackSubmitting,
      openMessageFeedback,
      closeMessageFeedback,
      submitMessageFeedback,
    ],
  );

  return (
    <AppChatWidgetContext.Provider value={value}>
      {!isEmbed ? <AppChatWidgetSettingsSync /> : null}
      {children}
    </AppChatWidgetContext.Provider>
  );
}

export function useAppChatWidget() {
  const context = useContext(AppChatWidgetContext);
  if (!context) {
    throw new Error('useAppChatWidget must be used inside AppChatWidgetProvider');
  }
  return context;
}

const noopAsync = async () => undefined;

export function AppChatWidgetPreviewProvider({
  children,
  config,
  customization,
  collectFeedback = true,
  avatarOptions = buildDefaultAvatarOptions(),
}: {
  children: React.ReactNode;
  config: ChatWidgetConfig;
  customization: ChatWidgetCustomization;
  collectFeedback?: boolean;
  avatarOptions?: AvatarOption[];
}) {
  const { t } = useTranslation();
  const defaultWelcomeText = t('chatbot.config.defaultWelcomeMessage');
  const [feedbackDraft, setFeedbackDraft] = useState<AppChatWidgetFeedbackDraft | null>(null);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const scrollOffsetYRef = useRef(0);

  const displayCustomization = useMemo(
    () => withResolvedWidgetAvatarCustomization(customization, avatarOptions),
    [avatarOptions, customization],
  );
  const previewWelcomeMessage = useMemo(
    () => createWelcomeMessage(config, defaultWelcomeText),
    [config, defaultWelcomeText],
  );
  const previewMessages = useMemo(
    () => [previewWelcomeMessage],
    [previewWelcomeMessage],
  );

  const openMessageFeedback = useCallback((messageId: string, sentiment: AppChatWidgetFeedbackSentiment) => {
    setFeedbackDraft({ messageId, sentiment });
  }, []);

  const closeMessageFeedback = useCallback(() => {
    setFeedbackDraft(null);
  }, []);

  const submitMessageFeedback = useCallback(async () => {
    setFeedbackSubmitting(true);
    try {
      await noopAsync();
    } finally {
      setFeedbackSubmitting(false);
      setFeedbackDraft(null);
    }
  }, []);

  const value = useMemo<AppChatWidgetContextValue>(
    () => ({
      isOpen: true,
      open: () => undefined,
      close: () => undefined,
      toggle: () => undefined,
      config,
      customization,
      displayCustomization,
      avatarOptions,
      collectFeedback,
      chatbotActive: true,
      settingsLoading: false,
      historyLoading: false,
      messages: previewMessages,
      sending: false,
      isTyping: false,
      isStreaming: false,
      streamingContent: '',
      streamSlow: false,
      draft: '',
      setDraft: () => undefined,
      sendMessage: noopAsync,
      clearConversation: noopAsync,
      reloadSettings: noopAsync,
      syncFromBundle: () => undefined,
      messageFeedback: {},
      setMessageFeedback: () => undefined,
      feedbackDraft,
      feedbackSubmitting,
      openMessageFeedback,
      closeMessageFeedback,
      submitMessageFeedback,
      scrollOffsetYRef,
    }),
    [
      avatarOptions,
      collectFeedback,
      config,
      customization,
      displayCustomization,
      feedbackDraft,
      feedbackSubmitting,
      openMessageFeedback,
      closeMessageFeedback,
      submitMessageFeedback,
      previewMessages,
      scrollOffsetYRef,
    ],
  );

  return <AppChatWidgetContext.Provider value={value}>{children}</AppChatWidgetContext.Provider>;
}
