import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import type {
  AiAssistantCapabilities,
  AiAssistantMessage,
  AiAssistantSession,
  AiAssistantSettings,
} from '@/features/ai-assistant/types/ai-assistant.types';
import {
  handleCreateAiAssistantSession,
  handleDeleteAiAssistantSession,
  handleGetAiAssistantCapabilities,
  handleGetAiAssistantSettings,
  handleListAiAssistantMessages,
  handleListAiAssistantSessions,
  handlePutAiAssistantSettings,
  handleRenameAiAssistantSession,
  handleStreamAiAssistantChat,
} from '@/network/actions/ai-assistant.actions';
import { useActiveProject } from '@/features/projects/providers/active-project-provider';
import { useToast } from '@/shared/toast/use-toast';
import { useTranslation } from '@/i18n';

export function useAiAssistant() {
  const { activeProjectId } = useActiveProject();
  const { toast } = useToast();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [streamingAssistantMessageId, setStreamingAssistantMessageId] = useState<string | null>(
    null,
  );
  const [sessions, setSessions] = useState<AiAssistantSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiAssistantMessage[]>([]);
  const [settings, setSettings] = useState<AiAssistantSettings | null>(null);
  const [capabilities, setCapabilities] = useState<AiAssistantCapabilities>({
    voice: false,
    voice_stt: false,
    voice_tts: false,
  });
  const [draft, setDraft] = useState('');
  const [sessionQuery, setSessionQuery] = useState('');
  const [answerFromSources, setAnswerFromSourcesState] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bootstrappedRef = useRef(false);

  const refreshSessions = useCallback(async () => {
    if (!activeProjectId) return;
    const list = await handleListAiAssistantSessions(activeProjectId);
    setSessions(list);
  }, [activeProjectId]);

  const refreshSettings = useCallback(async () => {
    if (!activeProjectId) return;
    const cfg = await handleGetAiAssistantSettings(activeProjectId);
    setSettings(cfg);
  }, [activeProjectId]);

  const loadSessionMessages = useCallback(
    async (sessionId: string) => {
      if (!activeProjectId) return;
      const list = await handleListAiAssistantMessages(activeProjectId, sessionId);
      setMessages(list);
    },
    [activeProjectId],
  );

  const bootstrap = useCallback(async () => {
    if (!activeProjectId) {
      // Project context not ready yet — stay loading to avoid Configure-models flash.
      setLoading(true);
      return;
    }
    setLoading(true);
    try {
      const [caps, cfg, list] = await Promise.all([
        handleGetAiAssistantCapabilities(activeProjectId),
        handleGetAiAssistantSettings(activeProjectId),
        handleListAiAssistantSessions(activeProjectId),
      ]);
      setCapabilities(caps);
      setSettings(cfg);
      setSessions(list);
      if (list[0]) {
        setActiveSessionId(list[0].id);
        const msgs = await handleListAiAssistantMessages(activeProjectId, list[0].id);
        setMessages(msgs);
      } else {
        setActiveSessionId(null);
        setMessages([]);
      }
      bootstrappedRef.current = true;
    } catch (error) {
      toast({
        title: t('aiAssistant.toast.loadFailed'),
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [activeProjectId, t, toast]);

  useEffect(() => {
    bootstrappedRef.current = false;
    void bootstrap();
    return () => {
      abortRef.current?.abort();
    };
  }, [bootstrap]);

  // When returning from model-settings, refresh settings without a full-screen reload.
  useFocusEffect(
    useCallback(() => {
      if (!activeProjectId || !bootstrappedRef.current) return;
      void refreshSettings().catch(() => {
        // ignore transient focus refresh errors
      });
      void refreshSessions().catch(() => {
        // ignore
      });
    }, [activeProjectId, refreshSettings, refreshSessions]),
  );

  const filteredSessions = useMemo(() => {
    const q = sessionQuery.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) => s.title.toLowerCase().includes(q));
  }, [sessions, sessionQuery]);

  const selectSession = useCallback(
    async (sessionId: string) => {
      setActiveSessionId(sessionId);
      await loadSessionMessages(sessionId);
    },
    [loadSessionMessages],
  );

  const createSession = useCallback(async () => {
    if (!activeProjectId) return;
    // Already on an empty session — do not spawn another "New chat".
    if (activeSessionId && messages.length === 0) {
      setDraft('');
      return;
    }
    try {
      const created = await handleCreateAiAssistantSession(activeProjectId);
      setSessions((prev) => [created, ...prev]);
      setActiveSessionId(created.id);
      setMessages([]);
      setDraft('');
    } catch (error) {
      toast({
        title: t('aiAssistant.toast.createFailed'),
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    }
  }, [activeProjectId, activeSessionId, messages.length, t, toast]);

  const renameSession = useCallback(
    async (sessionId: string, title: string) => {
      if (!activeProjectId) return;
      try {
        const updated = await handleRenameAiAssistantSession(activeProjectId, sessionId, title);
        setSessions((prev) => prev.map((s) => (s.id === sessionId ? updated : s)));
      } catch (error) {
        toast({
          title: t('aiAssistant.toast.renameFailed'),
          description: error instanceof Error ? error.message : undefined,
          variant: 'destructive',
        });
      }
    },
    [activeProjectId, t, toast],
  );

  const deleteSession = useCallback(
    async (sessionId: string) => {
      if (!activeProjectId) return;
      try {
        await handleDeleteAiAssistantSession(activeProjectId, sessionId);
        const next = sessions.filter((s) => s.id !== sessionId);
        setSessions(next);
        if (activeSessionId === sessionId) {
          const fallback = next[0];
          setActiveSessionId(fallback?.id ?? null);
          if (fallback) await loadSessionMessages(fallback.id);
          else setMessages([]);
        }
      } catch (error) {
        toast({
          title: t('aiAssistant.toast.deleteFailed'),
          description: error instanceof Error ? error.message : undefined,
          variant: 'destructive',
        });
      }
    },
    [activeProjectId, activeSessionId, loadSessionMessages, sessions, t, toast],
  );

  const sendMessage = useCallback(async () => {
    if (!activeProjectId || !draft.trim() || sending) return;
    let sessionId = activeSessionId;
    if (!sessionId) {
      const created = await handleCreateAiAssistantSession(activeProjectId);
      sessionId = created.id;
      setSessions((prev) => [created, ...prev]);
      setActiveSessionId(created.id);
    }

    const userText = draft.trim();
    setDraft('');
    const tempUserId = `local-user-${Date.now()}`;
    const tempAssistantId = `local-assistant-${Date.now()}`;
    // Mutable so token/done keep targeting the row after a late message_id remap.
    let assistantRowId = tempAssistantId;
    setMessages((prev) => [
      ...prev,
      { id: tempUserId, role: 'user', content: userText },
      { id: tempAssistantId, role: 'assistant', content: '' },
    ]);
    setSending(true);
    setStreamingAssistantMessageId(tempAssistantId);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await handleStreamAiAssistantChat(
        activeProjectId,
        sessionId,
        userText,
        (event) => {
          if (event.type === 'token') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantRowId
                  ? { ...m, content: `${m.content || ''}${event.content}` }
                  : m,
              ),
            );
          } else if (event.type === 'done') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantRowId ? { ...m, content: event.content } : m,
              ),
            );
          } else if (event.type === 'message_id') {
            const prevId = assistantRowId;
            assistantRowId = event.id;
            setStreamingAssistantMessageId(event.id);
            setMessages((prev) =>
              prev.map((m) => (m.id === prevId ? { ...m, id: event.id } : m)),
            );
          } else if (event.type === 'error') {
            toast({
              title: t('aiAssistant.toast.chatFailed'),
              description: event.message,
              variant: 'destructive',
            });
          }
        },
        controller.signal,
        { answerFromSources },
      );
      await loadSessionMessages(sessionId);
      await refreshSessions();
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') return;
      toast({
        title: t('aiAssistant.toast.chatFailed'),
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setSending(false);
      setStreamingAssistantMessageId(null);
    }
  }, [
    activeProjectId,
    activeSessionId,
    answerFromSources,
    draft,
    loadSessionMessages,
    refreshSessions,
    sending,
    t,
    toast,
  ]);

  const setAnswerFromSources = useCallback(
    (next: boolean) => {
      setAnswerFromSourcesState(next);
      toast({
        title: next ? t('aiAssistant.mode.toastOn') : t('aiAssistant.mode.toastOff'),
      });
    },
    [t, toast],
  );

  const setLanguage = useCallback(
    async (language: string) => {
      if (!activeProjectId) return;
      try {
        const next = await handlePutAiAssistantSettings(activeProjectId, { language });
        setSettings(next);
      } catch (error) {
        toast({
          title: t('aiAssistant.toast.languageFailed'),
          description: error instanceof Error ? error.message : undefined,
          variant: 'destructive',
        });
      }
    },
    [activeProjectId, t, toast],
  );

  return {
    loading,
    sending,
    streamingAssistantMessageId,
    sessions: filteredSessions,
    activeSessionId,
    messages,
    settings,
    capabilities,
    draft,
    setDraft,
    sessionQuery,
    setSessionQuery,
    answerFromSources,
    setAnswerFromSources,
    selectSession,
    createSession,
    renameSession,
    deleteSession,
    sendMessage,
    setLanguage,
    refreshSettings,
    needsSettings: !loading && (!settings?.configured || !settings?.chat_model),
  };
}
