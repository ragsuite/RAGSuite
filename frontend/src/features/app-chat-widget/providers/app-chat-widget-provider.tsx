import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import {
  clearAppChatSession,
  configureAppChatWidgetProject,
  loadAppChatDashboardHistoryForRecent,
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
  groupHistoryRowsToRecentSessions,
  mergeRecentSessions,
  type AppChatRecentSession,
} from '@/features/app-chat-widget/utils/app-chat-widget-recent-sessions';
import {
  generateChatSessionId,
  getDashboardChatSessionKey,
  getEmbedChatSessionKey,
  hydrateStoredSessionId,
  resolveSessionIdForHistoryLoad,
  writeEmbedChatSessionId,
  writeSharedChatSessionId,
  writeStoredSessionId,
} from '@/features/app-chat-widget/utils/app-chat-widget-session';
import {
  getDashboardChatSessionIndexKey,
  getEmbedChatSessionIndexKey,
  hydrateSessionIndex,
  markEmbedSessionIndexEntryEnded,
  markSharedSessionIndexEntryEnded,
  previewFromMessages,
  readSessionIndex,
  removeEmbedSessionIndexEntry,
  removeSharedSessionIndexEntry,
  upsertEmbedSessionIndexEntry,
  upsertSharedSessionIndexEntry,
  type ChatSessionIndexEntry,
} from '@/features/app-chat-widget/utils/app-chat-widget-session-index';
import {
  resolveEmbedSiteHost,
} from '@/features/app-chat-widget/utils/app-chat-widget-embed-site-host';
import {
  resolveLayout2ThreadMode,
  type AppChatThreadMode,
} from '@/features/app-chat-widget/utils/app-chat-widget-thread-mode';
import {
  clearChatWidgetPopOutWindow,
  focusChatWidgetPopOutWindow,
  isChatWidgetPopOutWindowOpen,
  publishChatWidgetPopOutSync,
  subscribeChatWidgetPopOutSync,
} from '@/features/app-chat-widget/utils/app-chat-widget-pop-out-sync';
import {
  createWelcomeMessage,
  isWelcomeMessage,
} from '@/features/app-chat-widget/utils/app-chat-widget-welcome';
import { preferStreamedContentForTts } from '@/features/app-chat-widget/utils/prefer-streamed-content-for-tts';
import {
  configureChatbotConfigProject,
  fetchChatWidgetAvatarOptions,
  fetchChatWidgetSettings,
} from '@/features/chatbot-config/services/chatbot-config.service';
import { useChatbotConfig } from '@/features/chatbot-config/hooks/useChatbotConfig';
import { useActiveProject } from '@/features/projects/providers/active-project-provider';
import type { AvatarOption, ChatWidgetConfig, ChatWidgetCustomization, FaqSettings, PrivacyNoticeSettings } from '@/features/chatbot-config/types/chatbot-config.types';
import { buildDefaultAvatarOptions } from '@/features/chatbot-config/utils/chatbot-api-mappers';
import { DEFAULT_FAQ_SETTINGS } from '@/features/chatbot-config/utils/faq-settings';
import { DEFAULT_PRIVACY_NOTICE_SETTINGS } from '@/features/chatbot-config/utils/privacy-notice-settings';
import { withResolvedWidgetAvatarCustomization } from '@/features/chatbot-config/utils/widget-avatar-display';
import { useTranslation } from '@/i18n';
import type { FeedbackReasonKey } from '@/shared/constants/feedback-reason-keys';
import { subscribeAdminChatSessionsDeleted } from '@/shared/utils/admin-chat-sync';
import { Platform } from 'react-native';

type AppChatWidgetContextValue = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  config: ChatWidgetConfig | null;
  customization: ChatWidgetCustomization | null;
  displayCustomization: ChatWidgetCustomization | null;
  faqSettings: FaqSettings;
  privacyNoticeSettings: PrivacyNoticeSettings;
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
  /** Soft-hide current session (End Session menu) and start a new id. Layout 1. */
  clearConversation: () => Promise<void>;
  /** Archive current session into Recent (no soft-delete) and start a new id. */
  startNewConversation: () => Promise<void>;
  /** Open a Recent session (Layout 2: live vs readonly). */
  switchSession: (sessionId: string) => Promise<void>;
  /** Layout 2: return from a readonly thread to the live session. */
  returnToLiveChat: () => Promise<void>;
  /** Layout 2: End session — mark ended, keep in Recent, stay readonly (no API soft-hide). */
  endLiveConversation: () => Promise<void>;
  /** Layout 2 Messages Recent rows. */
  recentSessions: AppChatRecentSession[];
  refreshRecentSessions: () => Promise<void>;
  /** Live session id (composer / send / pop-out). */
  getSessionId: () => string | undefined;
  /** Layout 2 thread mode for the session currently on screen. */
  threadMode: AppChatThreadMode;
  liveSessionId: string | null;
  viewingSessionId: string | null;
  viewingEndedAt: string | null;
  showReturnToLiveChat: boolean;
  reloadSettings: () => Promise<void>;
  syncFromBundle: (payload: {
    config: ChatWidgetConfig;
    customization: ChatWidgetCustomization;
    faqSettings?: FaqSettings;
    privacyNoticeSettings?: PrivacyNoticeSettings;
    collectFeedback: boolean;
    storeHistoryEnabled?: boolean;
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
  /** Standalone browser popup (`/embed/chatbot?...&pop=1`). */
  standalonePopOut: boolean;
};

const AppChatWidgetContext = createContext<AppChatWidgetContextValue | null>(null);

type Props = {
  children: React.ReactNode;
  /** Third-party script embed — skips admin SettingsSync and uses embed session keys. */
  mode?: 'dashboard' | 'embed';
  /** Optional session id seeded from the host page (legacy localStorage). */
  initialSessionId?: string | null;
  /** Parent website host for per-site Recent isolation (embed only). */
  embedSiteHost?: string | null;
  /** Optional parentOrigin query fallback when hostname resolution is unavailable. */
  parentOrigin?: string | null;
  /** Auto-open full-window chat for Pop out widget windows. */
  standalonePopOut?: boolean;
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
      bundle.faqSettings,
      bundle.privacyNoticeSettings,
      bundle.feedbackSettings.collectFeedback,
      bundle.privacySettings.storeHistoryEnabled,
      bundle.activeConfig?.chatbotActive,
    ]);
    if (syncedKeyRef.current === key) return;
    syncedKeyRef.current = key;

    syncFromBundle({
      config: bundle.chatWidgetConfig,
      customization: bundle.chatWidgetCustomization,
      faqSettings: bundle.faqSettings,
      privacyNoticeSettings: bundle.privacyNoticeSettings,
      collectFeedback: bundle.feedbackSettings.collectFeedback && bundle.privacySettings.storeHistoryEnabled,
      chatbotActive: bundle.activeConfig?.chatbotActive,
      storeHistoryEnabled: bundle.privacySettings.storeHistoryEnabled,
      avatarOptions: bundle.avatarOptions,
    });
  }, [
    bundle?.chatWidgetConfig,
    bundle?.chatWidgetCustomization,
    bundle?.faqSettings,
    bundle?.privacyNoticeSettings,
    bundle?.feedbackSettings.collectFeedback,
    bundle?.privacySettings.storeHistoryEnabled,
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
  embedSiteHost: embedSiteHostProp = null,
  parentOrigin = null,
  standalonePopOut = false,
}: Props) {
  const { t } = useTranslation();
  const defaultWelcomeText = t('chatbot.config.defaultWelcomeMessage');
  const { activeProjectId } = useActiveProject();
  const isEmbed = mode === 'embed';
  const embedSiteHost = useMemo(() => {
    if (!isEmbed) return 'local';
    return resolveEmbedSiteHost({
      explicitHost: embedSiteHostProp,
      parentOrigin,
    });
  }, [embedSiteHostProp, isEmbed, parentOrigin]);
  const [isOpen, setIsOpen] = useState(Boolean(standalonePopOut));
  const didAutoOpenPopOutRef = useRef(false);
  const [config, setConfig] = useState<ChatWidgetConfig | null>(null);
  const [customization, setCustomization] = useState<ChatWidgetCustomization | null>(null);
  const [privacyNoticeSettings, setPrivacyNoticeSettings] = useState<PrivacyNoticeSettings>({
    ...DEFAULT_PRIVACY_NOTICE_SETTINGS,
    linkPhrases: [],
  });
  const [faqSettings, setFaqSettings] = useState<FaqSettings>({
    ...DEFAULT_FAQ_SETTINGS,
    questions: [],
  });
  const [avatarOptions, setAvatarOptions] = useState<AvatarOption[]>(buildDefaultAvatarOptions());
  const [collectFeedback, setCollectFeedback] = useState(true);
  const [storeHistoryEnabled, setStoreHistoryEnabled] = useState(true);
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
  const [recentSessions, setRecentSessions] = useState<AppChatRecentSession[]>([]);
  const [liveSessionId, setLiveSessionId] = useState<string | null>(null);
  const [viewingSessionId, setViewingSessionId] = useState<string | null>(null);
  const [threadMode, setThreadMode] = useState<AppChatThreadMode>('live');
  const [viewingEndedAt, setViewingEndedAt] = useState<string | null>(null);
  const [showReturnToLiveChat, setShowReturnToLiveChat] = useState(false);
  const sessionIdRef = useRef<string | undefined>(undefined);
  const liveSessionIdRef = useRef<string | undefined>(undefined);
  const skipNextHistoryLoadRef = useRef(false);
  const historyHydratedSessionIdRef = useRef<string | null>(null);
  const messagesRef = useRef<AppChatMessage[]>([]);
  const scrollOffsetYRef = useRef(0);
  const sessionStorageKeyRef = useRef<string | null>(null);
  const sessionIndexKeyRef = useRef<string | null>(null);
  const activeStreamAbortRef = useRef<AbortController | null>(null);
  const activeRequestIdRef = useRef(0);
  const seededSessionRef = useRef(false);
  const configRefHasSettings = useRef(false);
  const popOutActiveRef = useRef(false);
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  messagesRef.current = messages;

  const persistActiveSessionId = useCallback(
    (sessionId: string) => {
      if (!activeProjectId) {
        if (sessionStorageKeyRef.current) {
          writeStoredSessionId(sessionStorageKeyRef.current, sessionId);
        }
        return;
      }
      if (isEmbed) {
        writeEmbedChatSessionId(activeProjectId, embedSiteHost, sessionId);
      } else {
        writeSharedChatSessionId(activeProjectId, sessionId);
      }
    },
    [activeProjectId, embedSiteHost, isEmbed],
  );

  const removeRecentSessionEntry = useCallback(
    (sessionId: string) => {
      if (!activeProjectId) return;
      if (isEmbed) {
        removeEmbedSessionIndexEntry(activeProjectId, embedSiteHost, sessionId);
      } else {
        removeSharedSessionIndexEntry(activeProjectId, sessionId);
      }
    },
    [activeProjectId, embedSiteHost, isEmbed],
  );

  const upsertRecentSessionEntry = useCallback(
    (entry: ChatSessionIndexEntry) => {
      if (!activeProjectId) return;
      if (isEmbed) {
        upsertEmbedSessionIndexEntry(activeProjectId, embedSiteHost, entry);
      } else {
        upsertSharedSessionIndexEntry(activeProjectId, entry);
      }
    },
    [activeProjectId, embedSiteHost, isEmbed],
  );

  const markRecentSessionEnded = useCallback(
    (sessionId: string, endedAt: string = new Date().toISOString()) => {
      if (!activeProjectId) return;
      if (isEmbed) {
        markEmbedSessionIndexEntryEnded(activeProjectId, embedSiteHost, sessionId, endedAt);
      } else {
        markSharedSessionIndexEntryEnded(activeProjectId, sessionId, endedAt);
      }
    },
    [activeProjectId, embedSiteHost, isEmbed],
  );

  const syncThreadModeFromIndex = useCallback(
    (viewingId: string | null | undefined, liveId: string | null | undefined) => {
      const indexKey = sessionIndexKeyRef.current;
      const index = indexKey ? readSessionIndex(indexKey) : [];
      const resolved = resolveLayout2ThreadMode({
        viewingSessionId: viewingId,
        liveSessionId: liveId,
        index,
      });
      setThreadMode(resolved.mode);
      setViewingEndedAt(resolved.endedAt);
      setShowReturnToLiveChat(resolved.showReturnToLive);
      setViewingSessionId(viewingId?.trim() || null);
      setLiveSessionId(liveId?.trim() || null);
    },
    [],
  );

  const archiveActiveSessionToIndex = useCallback(
    (options?: { markEnded?: boolean }) => {
      const sessionId = liveSessionIdRef.current?.trim() || sessionIdRef.current?.trim();
      if (!sessionId || !activeProjectId) return;
      const previewInfo = previewFromMessages(messagesRef.current, (message) =>
        isWelcomeMessage(message as AppChatMessage),
      );
      const endedAt = options?.markEnded ? new Date().toISOString() : undefined;
      if (previewInfo) {
        upsertRecentSessionEntry({
          sessionId,
          preview: previewInfo.preview,
          updatedAt: previewInfo.updatedAt,
          ...(endedAt ? { endedAt } : {}),
        });
      } else if (endedAt) {
        markRecentSessionEnded(sessionId, endedAt);
      }
    },
    [activeProjectId, markRecentSessionEnded, upsertRecentSessionEntry],
  );

  const refreshRecentSessions = useCallback(async () => {
    if (!activeProjectId) {
      setRecentSessions([]);
      return;
    }

    const indexKey = isEmbed
      ? getEmbedChatSessionIndexKey(activeProjectId, embedSiteHost)
      : getDashboardChatSessionIndexKey(activeProjectId);
    sessionIndexKeyRef.current = indexKey;
    const local = await hydrateSessionIndex(indexKey);

    if (isEmbed) {
      setRecentSessions(local);
    } else {
      try {
        const rows = await loadAppChatDashboardHistoryForRecent(100);
        const remote = groupHistoryRowsToRecentSessions(rows);
        setRecentSessions(mergeRecentSessions(local, remote));
      } catch {
        setRecentSessions(local);
      }
    }

    syncThreadModeFromIndex(
      sessionIdRef.current ?? null,
      liveSessionIdRef.current ?? null,
    );
  }, [activeProjectId, embedSiteHost, isEmbed, syncThreadModeFromIndex]);

  useEffect(() => {
    configureAppChatWidgetProject(activeProjectId);
    configureChatbotConfigProject(activeProjectId);
    let cancelled = false;

    if (!activeProjectId) {
      sessionStorageKeyRef.current = null;
      sessionIndexKeyRef.current = null;
      sessionIdRef.current = undefined;
      liveSessionIdRef.current = undefined;
      historyHydratedSessionIdRef.current = null;
      configRefHasSettings.current = false;
      setRecentSessions([]);
      setLiveSessionId(null);
      setViewingSessionId(null);
      setThreadMode('live');
      setViewingEndedAt(null);
      setShowReturnToLiveChat(false);
      return;
    }

    const storageKey = isEmbed
      ? getEmbedChatSessionKey(activeProjectId, embedSiteHost)
      : getDashboardChatSessionKey(activeProjectId);
    sessionStorageKeyRef.current = storageKey;
    sessionIndexKeyRef.current = isEmbed
      ? getEmbedChatSessionIndexKey(activeProjectId, embedSiteHost)
      : getDashboardChatSessionIndexKey(activeProjectId);
    // Clear immediately so a fast open cannot send the previous project's session.
    sessionIdRef.current = undefined;
    liveSessionIdRef.current = undefined;
    historyHydratedSessionIdRef.current = null;
    configRefHasSettings.current = false;
    void refreshRecentSessions();

    void hydrateStoredSessionId(storageKey).then((stored) => {
      if (cancelled) return;
      const seeded =
        isEmbed && !seededSessionRef.current && initialSessionId?.trim()
          ? initialSessionId.trim()
          : undefined;
      if (seeded) {
        seededSessionRef.current = true;
        sessionIdRef.current = seeded;
        liveSessionIdRef.current = seeded;
        writeStoredSessionId(storageKey, seeded);
        if (standalonePopOut) {
          persistActiveSessionId(seeded);
        }
        syncThreadModeFromIndex(seeded, seeded);
        return;
      }
      sessionIdRef.current = stored;
      // If the stored session was ended (Layout 2 End session), keep it as
      // viewing-only — no live until New Conversation.
      const indexKey = sessionIndexKeyRef.current;
      const index = indexKey ? readSessionIndex(indexKey) : [];
      const storedEnded = Boolean(
        stored &&
          index.find((entry) => entry.sessionId === stored)?.endedAt?.trim(),
      );
      if (storedEnded) {
        liveSessionIdRef.current = undefined;
        syncThreadModeFromIndex(stored, null);
      } else {
        liveSessionIdRef.current = stored;
        syncThreadModeFromIndex(stored ?? null, stored ?? null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    activeProjectId,
    embedSiteHost,
    initialSessionId,
    isEmbed,
    persistActiveSessionId,
    refreshRecentSessions,
    standalonePopOut,
    syncThreadModeFromIndex,
  ]);

  const reloadSettings = useCallback(async () => {
    // Only flash the loading shell on first load — silent refresh avoids mid-read jumps.
    const showLoading = !configRefHasSettings.current;
    if (showLoading) setSettingsLoading(true);
    try {
      const settings = await fetchChatWidgetSettings();
      configRefHasSettings.current = true;
      setConfig(settings.config);
      setCustomization(settings.customization);
      setFaqSettings(settings.faqSettings);
      setPrivacyNoticeSettings(settings.privacyNoticeSettings);
      setAvatarOptions(settings.avatarOptions);
      setChatbotActive(settings.chatbotActive);
      setCollectFeedback(settings.collectFeedback);
      setStoreHistoryEnabled(settings.storeHistoryEnabled);
    } finally {
      if (showLoading) setSettingsLoading(false);
    }
    // Avatars are not paint-critical — refresh after launcher can post resize.
    void fetchChatWidgetAvatarOptions()
      .then((options) => {
        setAvatarOptions(options);
      })
      .catch(() => {
        /* keep current / default options */
      });
  }, []);

  const loadSessionHistory = useCallback(async (explicitSessionId?: string) => {
    if (!storeHistoryEnabled) return;

    let stored: string | undefined;
    if (sessionStorageKeyRef.current) {
      stored = await hydrateStoredSessionId(sessionStorageKeyRef.current);
    }

    const sessionId = resolveSessionIdForHistoryLoad({
      explicit: explicitSessionId,
      stored,
    });
    // Explicit Recent / switch targets must not be overwritten by live storage.
    sessionIdRef.current = sessionId;

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
      if (restored.length > 0 && activeProjectId) {
        const previewInfo = previewFromMessages(
          welcome ? [welcome, ...restored] : restored,
          (message) => isWelcomeMessage(message as AppChatMessage),
        );
        if (previewInfo) {
          upsertRecentSessionEntry({
            sessionId,
            preview: previewInfo.preview,
            updatedAt: previewInfo.updatedAt,
          });
          void refreshRecentSessions();
        }
      }
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
  }, [
    activeProjectId,
    config,
    defaultWelcomeText,
    refreshRecentSessions,
    storeHistoryEnabled,
    upsertRecentSessionEntry,
  ]);

  const syncFromBundle = useCallback(
    (payload: {
      config: ChatWidgetConfig;
      customization: ChatWidgetCustomization;
      faqSettings?: FaqSettings;
      privacyNoticeSettings?: PrivacyNoticeSettings;
      collectFeedback: boolean;
      storeHistoryEnabled?: boolean;
      chatbotActive?: boolean;
      avatarOptions?: AvatarOption[];
    }) => {
      setConfig(payload.config);
      setCustomization(payload.customization);
      if (payload.faqSettings) {
        setFaqSettings({
          ...payload.faqSettings,
          questions: payload.faqSettings.questions.map((q) => ({ ...q })),
        });
      }
      if (payload.privacyNoticeSettings) {
        setPrivacyNoticeSettings({
          ...payload.privacyNoticeSettings,
          linkPhrases: [...payload.privacyNoticeSettings.linkPhrases],
        });
      }
      if (payload.avatarOptions?.length) {
        setAvatarOptions(payload.avatarOptions);
      }
      setCollectFeedback(payload.collectFeedback);
      if (payload.storeHistoryEnabled !== undefined) {
        setStoreHistoryEnabled(payload.storeHistoryEnabled);
      }
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
      if (activeProjectId) {
        for (const id of detail.sessionIds) {
          removeRecentSessionEntry(id);
        }
        void refreshRecentSessions();
      }
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
  }, [
    activeProjectId,
    config,
    defaultWelcomeText,
    refreshRecentSessions,
    removeRecentSessionEntry,
  ]);

  const open = useCallback(() => {
    if (!standalonePopOut && popOutActiveRef.current) {
      if (focusChatWidgetPopOutWindow()) {
        setIsOpen(false);
        return;
      }
      // Popup gone without a closed event — allow open and recover.
      popOutActiveRef.current = false;
      clearChatWidgetPopOutWindow();
    }
    setIsOpen(true);
    void reloadSettings();
    void loadSessionHistory();
    void refreshRecentSessions();
  }, [loadSessionHistory, refreshRecentSessions, reloadSettings, standalonePopOut]);

  const close = useCallback(() => {
    setIsOpen(false);
    setFeedbackDraft(null);
  }, []);

  useEffect(() => {
    if (!standalonePopOut || !isEmbed || didAutoOpenPopOutRef.current) return;
    didAutoOpenPopOutRef.current = true;
    open();
  }, [standalonePopOut, isEmbed, open]);

  useEffect(() => {
    if (!chatbotActive) {
      close();
    }
  }, [chatbotActive, close]);

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      if (next) {
        if (!standalonePopOut && popOutActiveRef.current) {
          if (focusChatWidgetPopOutWindow()) {
            return false;
          }
          popOutActiveRef.current = false;
          clearChatWidgetPopOutWindow();
        }
        void reloadSettings();
        void loadSessionHistory();
        void refreshRecentSessions();
      }
      return next;
    });
  }, [loadSessionHistory, refreshRecentSessions, reloadSettings, standalonePopOut]);

  const clearConversation = useCallback(async () => {
    // Layout 1: soft-hide + remove from Recent + new live session (unchanged).
    const sessionId = sessionIdRef.current;
    if (sessionId) {
      try {
        await clearAppChatSession(sessionId);
      } catch {
        // Local reset still proceeds if API delete fails.
      }
      if (activeProjectId) {
        removeRecentSessionEntry(sessionId);
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
    liveSessionIdRef.current = nextSessionId;
    persistActiveSessionId(nextSessionId);
    syncThreadModeFromIndex(nextSessionId, nextSessionId);
    if (standalonePopOut && activeProjectId) {
      publishChatWidgetPopOutSync({
        type: 'session',
        projectId: activeProjectId,
        sessionId: nextSessionId,
      });
    }
    void refreshRecentSessions();
  }, [
    activeProjectId,
    config,
    defaultWelcomeText,
    persistActiveSessionId,
    refreshRecentSessions,
    removeRecentSessionEntry,
    standalonePopOut,
    syncThreadModeFromIndex,
  ]);

  /** Layout 2 End session: mark ended, keep in Recent, stay on readonly thread (no API soft-hide). */
  const endLiveConversation = useCallback(async () => {
    const sessionId = liveSessionIdRef.current?.trim() || sessionIdRef.current?.trim();
    if (sessionId) {
      archiveActiveSessionToIndex({ markEnded: true });
    }
    setMessageFeedbackState({});
    setFeedbackDraft(null);
    setDraft('');
    setIsTyping(false);
    setIsStreaming(false);
    setStreamingContent('');
    setStreamSlow(false);
    scrollOffsetYRef.current = 0;
    // Stay viewing the ended session; no new live until New Conversation.
    if (sessionId) {
      sessionIdRef.current = sessionId;
      liveSessionIdRef.current = undefined;
      const endedAt = new Date().toISOString();
      syncThreadModeFromIndex(sessionId, null);
      // Ensure endedAt is visible even before index refresh.
      setThreadMode('readonly');
      setViewingEndedAt(endedAt);
      setShowReturnToLiveChat(false);
      setLiveSessionId(null);
      setViewingSessionId(sessionId);
    }
    void refreshRecentSessions();
  }, [archiveActiveSessionToIndex, refreshRecentSessions, syncThreadModeFromIndex]);

  const startNewConversation = useCallback(async () => {
    archiveActiveSessionToIndex({ markEnded: true });
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
    skipNextHistoryLoadRef.current = true;
    const nextSessionId = generateChatSessionId();
    sessionIdRef.current = nextSessionId;
    liveSessionIdRef.current = nextSessionId;
    persistActiveSessionId(nextSessionId);
    syncThreadModeFromIndex(nextSessionId, nextSessionId);
    if (standalonePopOut && activeProjectId) {
      publishChatWidgetPopOutSync({
        type: 'session',
        projectId: activeProjectId,
        sessionId: nextSessionId,
      });
    }
    void refreshRecentSessions();
  }, [
    activeProjectId,
    archiveActiveSessionToIndex,
    config,
    defaultWelcomeText,
    persistActiveSessionId,
    refreshRecentSessions,
    standalonePopOut,
    syncThreadModeFromIndex,
  ]);

  const switchSession = useCallback(
    async (sessionId: string) => {
      const nextId = sessionId.trim();
      if (!nextId) return;

      const liveId = liveSessionIdRef.current?.trim() || null;
      const indexKey = sessionIndexKeyRef.current;
      const index = indexKey ? readSessionIndex(indexKey) : [];
      const resolved = resolveLayout2ThreadMode({
        viewingSessionId: nextId,
        liveSessionId: liveId,
        index,
      });

      // Opening the live session: continue chatting.
      if (resolved.mode === 'live') {
        if (sessionIdRef.current === nextId) {
          historyHydratedSessionIdRef.current = null;
          skipNextHistoryLoadRef.current = false;
          await loadSessionHistory(nextId);
          syncThreadModeFromIndex(nextId, liveId || nextId);
          return;
        }
        setMessageFeedbackState({});
        setFeedbackDraft(null);
        setDraft('');
        setIsTyping(false);
        setIsStreaming(false);
        setStreamingContent('');
        setStreamSlow(false);
        scrollOffsetYRef.current = 0;
        historyHydratedSessionIdRef.current = null;
        skipNextHistoryLoadRef.current = false;
        sessionIdRef.current = nextId;
        liveSessionIdRef.current = nextId;
        persistActiveSessionId(nextId);
        syncThreadModeFromIndex(nextId, nextId);
        if (standalonePopOut && activeProjectId) {
          publishChatWidgetPopOutSync({
            type: 'session',
            projectId: activeProjectId,
            sessionId: nextId,
          });
        }
        await loadSessionHistory(nextId);
        void refreshRecentSessions();
        return;
      }

      // Readonly: load history without moving liveSessionId.
      setMessageFeedbackState({});
      setFeedbackDraft(null);
      setDraft('');
      setIsTyping(false);
      setIsStreaming(false);
      setStreamingContent('');
      setStreamSlow(false);
      scrollOffsetYRef.current = 0;
      historyHydratedSessionIdRef.current = null;
      skipNextHistoryLoadRef.current = false;
      sessionIdRef.current = nextId;
      // Do not persist as live / do not overwrite liveSessionIdRef.
      syncThreadModeFromIndex(nextId, liveId);
      await loadSessionHistory(nextId);
      void refreshRecentSessions();
    },
    [
      activeProjectId,
      loadSessionHistory,
      persistActiveSessionId,
      refreshRecentSessions,
      standalonePopOut,
      syncThreadModeFromIndex,
    ],
  );

  const returnToLiveChat = useCallback(async () => {
    const liveId = liveSessionIdRef.current?.trim();
    if (!liveId) return;
    await switchSession(liveId);
  }, [switchSession]);

  const getSessionId = useCallback(
    () => liveSessionIdRef.current ?? sessionIdRef.current,
    [],
  );

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
    if (threadMode !== 'live') return;

    if (!liveSessionIdRef.current) {
      const nextId = sessionIdRef.current || generateChatSessionId();
      liveSessionIdRef.current = nextId;
      sessionIdRef.current = nextId;
    } else if (sessionIdRef.current !== liveSessionIdRef.current) {
      // Always send on the live session, not a readonly viewing session.
      sessionIdRef.current = liveSessionIdRef.current;
    }

    if (!sessionIdRef.current) {
      sessionIdRef.current = generateChatSessionId();
      liveSessionIdRef.current = sessionIdRef.current;
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
      liveSessionIdRef.current = result.sessionId;
      historyHydratedSessionIdRef.current = result.sessionId;
      skipNextHistoryLoadRef.current = true;
      persistActiveSessionId(result.sessionId);
      syncThreadModeFromIndex(result.sessionId, result.sessionId);
      if (standalonePopOut && activeProjectId) {
        publishChatWidgetPopOutSync({
          type: 'session',
          projectId: activeProjectId,
          sessionId: result.sessionId,
        });
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

      if (activeProjectId && result.sessionId) {
        const preview =
          contentForMessage.trim() ||
          trimmed ||
          '';
        if (preview) {
          upsertRecentSessionEntry({
            sessionId: result.sessionId,
            preview,
            updatedAt: new Date().toISOString(),
          });
          void refreshRecentSessions();
        }
      }
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
  }, [activeProjectId, draft, persistActiveSessionId, refreshRecentSessions, sending, standalonePopOut, syncThreadModeFromIndex, threadMode, upsertRecentSessionEntry]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !activeProjectId) return;

    if (standalonePopOut) {
      publishChatWidgetPopOutSync({
        type: 'opened',
        projectId: activeProjectId,
        sessionId: sessionIdRef.current,
      });
      const onUnload = () => {
        publishChatWidgetPopOutSync({
          type: 'closed',
          projectId: activeProjectId,
        });
      };
      window.addEventListener('pagehide', onUnload);
      return () => {
        window.removeEventListener('pagehide', onUnload);
        onUnload();
      };
    }

    const releasePopOut = () => {
      popOutActiveRef.current = false;
      clearChatWidgetPopOutWindow();
      historyHydratedSessionIdRef.current = null;
      void (async () => {
        if (sessionStorageKeyRef.current) {
          const stored = await hydrateStoredSessionId(sessionStorageKeyRef.current);
          sessionIdRef.current = stored;
        }
        if (isOpenRef.current) {
          void loadSessionHistory();
        }
      })();
    };

    // Backup when BroadcastChannel `closed` is lost on popup unload.
    const pollId = window.setInterval(() => {
      if (!popOutActiveRef.current) return;
      if (!isChatWidgetPopOutWindowOpen()) {
        releasePopOut();
      }
    }, 500);

    const unsubscribe = subscribeChatWidgetPopOutSync((message) => {
      if (message.projectId !== activeProjectId) return;

      if (message.type === 'opened') {
        popOutActiveRef.current = true;
        if (message.sessionId?.trim()) {
          const nextId = message.sessionId.trim();
          sessionIdRef.current = nextId;
          persistActiveSessionId(nextId);
        }
        historyHydratedSessionIdRef.current = null;
        close();
        return;
      }

      if (message.type === 'closed') {
        releasePopOut();
        return;
      }

      if (message.type === 'session') {
        const nextId = message.sessionId?.trim();
        if (!nextId) return;
        sessionIdRef.current = nextId;
        persistActiveSessionId(nextId);
        historyHydratedSessionIdRef.current = null;
        if (isOpenRef.current) {
          void loadSessionHistory();
        }
      }
    });

    return () => {
      window.clearInterval(pollId);
      unsubscribe();
    };
  }, [activeProjectId, close, loadSessionHistory, persistActiveSessionId, standalonePopOut]);

  const value = useMemo(
    () => ({
      isOpen,
      open,
      close,
      toggle,
      config,
      customization,
      displayCustomization,
      faqSettings,
      privacyNoticeSettings,
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
      startNewConversation,
      switchSession,
      returnToLiveChat,
      endLiveConversation,
      recentSessions,
      refreshRecentSessions,
      getSessionId,
      threadMode,
      liveSessionId,
      viewingSessionId,
      viewingEndedAt,
      showReturnToLiveChat,
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
      standalonePopOut,
    }),
    [
      isOpen,
      open,
      close,
      toggle,
      config,
      customization,
      displayCustomization,
      faqSettings,
      privacyNoticeSettings,
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
      startNewConversation,
      switchSession,
      returnToLiveChat,
      endLiveConversation,
      recentSessions,
      refreshRecentSessions,
      getSessionId,
      threadMode,
      liveSessionId,
      viewingSessionId,
      viewingEndedAt,
      showReturnToLiveChat,
      reloadSettings,
      syncFromBundle,
      messageFeedback,
      setMessageFeedback,
      feedbackDraft,
      feedbackSubmitting,
      openMessageFeedback,
      closeMessageFeedback,
      submitMessageFeedback,
      standalonePopOut,
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
const noopSwitchSession = async (_sessionId: string) => undefined;

export function AppChatWidgetPreviewProvider({
  children,
  config,
  customization,
  faqSettings = DEFAULT_FAQ_SETTINGS,
  privacyNoticeSettings = DEFAULT_PRIVACY_NOTICE_SETTINGS,
  collectFeedback = true,
  avatarOptions = buildDefaultAvatarOptions(),
}: {
  children: React.ReactNode;
  config: ChatWidgetConfig;
  customization: ChatWidgetCustomization;
  faqSettings?: FaqSettings;
  privacyNoticeSettings?: PrivacyNoticeSettings;
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
  const previewFaqSettings = useMemo(
    () => ({
      ...faqSettings,
      questions: faqSettings.questions.map((q) => ({ ...q })),
    }),
    [faqSettings],
  );
  const previewPrivacyNoticeSettings = useMemo(
    () => ({
      ...privacyNoticeSettings,
      linkPhrases: [...privacyNoticeSettings.linkPhrases],
    }),
    [privacyNoticeSettings],
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
      faqSettings: previewFaqSettings,
      privacyNoticeSettings: previewPrivacyNoticeSettings,
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
      startNewConversation: noopAsync,
      switchSession: noopSwitchSession,
      returnToLiveChat: noopAsync,
      endLiveConversation: noopAsync,
      recentSessions: [],
      refreshRecentSessions: noopAsync,
      getSessionId: () => undefined,
      threadMode: 'live',
      liveSessionId: null,
      viewingSessionId: null,
      viewingEndedAt: null,
      showReturnToLiveChat: false,
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
      standalonePopOut: false,
    }),
    [
      avatarOptions,
      collectFeedback,
      config,
      customization,
      displayCustomization,
      previewFaqSettings,
      previewPrivacyNoticeSettings,
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
