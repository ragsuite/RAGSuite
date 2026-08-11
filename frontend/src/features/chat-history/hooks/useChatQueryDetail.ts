import { useCallback, useEffect, useState } from 'react';

import { useAuthenticatedBootstrap } from '@/features/auth/hooks/use-authenticated-bootstrap';
import { fetchChatQueryById } from '@/features/chat-history/services/chat-history.service';
import type { ChatQueryDetail } from '@/features/chat-history/types/chat-history.types';
import { getCachedChatQueryDetail } from '@/features/chat-history/utils/chat-query-cache';
import { useTranslation } from '@/i18n';

const DEFAULT_ERROR_KEY = 'history.error.detailDescription';

export function useChatQueryDetail(messageId: string | undefined) {
  const { isReady } = useAuthenticatedBootstrap();
  const { t } = useTranslation();
  const [detail, setDetail] = useState<ChatQueryDetail | null>(() =>
    messageId ? (getCachedChatQueryDetail(messageId) ?? null) : null,
  );
  const [loading, setLoading] = useState(Boolean(messageId));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!messageId) {
      setDetail(null);
      setLoading(false);
      setError(t('history.error.detailDescription'));
      return;
    }

    const stale = getCachedChatQueryDetail(messageId);
    if (stale) setDetail(stale);

    setLoading(true);
    setError(null);

    try {
      const loaded = await fetchChatQueryById(messageId);
      if (!loaded) {
        setDetail(stale ?? null);
        setError(t('history.error.detailDescription'));
        return;
      }
      setDetail(loaded);
    } catch (err) {
      if (!stale) {
        setDetail(null);
        const message = err instanceof Error && err.message ? err.message : t(DEFAULT_ERROR_KEY);
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, [messageId, t]);

  useEffect(() => {
    if (!isReady) {
      return;
    }
    void load();
  }, [isReady, load]);

  return { detail, loading, error, reload: load };
}
