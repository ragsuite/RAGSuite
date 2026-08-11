import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';

import { useAuthenticatedBootstrap } from '@/features/auth/hooks/use-authenticated-bootstrap';
import {
  deleteAllNotifications,
  deleteNotification,
  fetchNotifications,
  fetchUnreadNotificationCount,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from '@/features/notifications/services/notification.service';
import type { Notification, ReadFilter, TypeFilter } from '@/features/notifications/types/notification.types';
import { useTranslation } from '@/i18n';
import { useNotificationAlerts } from '@/features/notifications/providers/notification-alerts-provider';
import { useToastRef } from '@/shared/toast/use-toast-ref';

/** Reference NotificationInbox poll cadence while the inbox is open. */
const INBOX_POLL_INTERVAL_MS = 15_000;

function sortByCreatedAtDesc(a: Notification, b: Notification) {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

export function useNotifications() {
  const { isReady } = useAuthenticatedBootstrap();
  const { t } = useTranslation();
  const toastRef = useToastRef();
  const { refresh: refreshAlerts } = useNotificationAlerts();
  const [items, setItems] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readFilter, setReadFilter] = useState<ReadFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [isPageVisible, setIsPageVisible] = useState(true);

  const syncAlerts = useCallback(() => {
    void refreshAlerts();
  }, [refreshAlerts]);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' | 'poll' = 'initial') => {
      setError(null);
      if (mode === 'initial') setLoading(true);
      if (mode === 'refresh') setRefreshing(true);

      try {
        const [data, count] = await Promise.all([
          fetchNotifications({
            unreadOnly: readFilter === 'unread',
          }),
          fetchUnreadNotificationCount(),
        ]);
        setItems(data.sort(sortByCreatedAtDesc));
        setUnreadCount(count);
      } catch (err) {
        // Keep last-known list on background poll failures; surface errors for user-driven loads.
        if (mode !== 'poll') {
          const message = err instanceof Error && err.message ? err.message : t('notifications.error.loadFailed');
          setError(message);
        }
      } finally {
        if (mode === 'initial') setLoading(false);
        if (mode === 'refresh') setRefreshing(false);
      }
    },
    [readFilter, t],
  );

  useEffect(() => {
    if (!isReady) {
      return;
    }
    void load('initial');
  }, [isReady, load]);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const onVisibility = () => setIsPageVisible(!document.hidden);
      onVisibility();
      document.addEventListener('visibilitychange', onVisibility);
      return () => document.removeEventListener('visibilitychange', onVisibility);
    }

    const onChange = (next: AppStateStatus) => {
      setIsPageVisible(next === 'active');
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!isReady || !isPageVisible) return;

    const timer = setInterval(() => {
      void load('poll');
    }, INBOX_POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [isReady, isPageVisible, load]);

  const visibleNotifications = useMemo(() => {
    return items.filter((n) => {
      if (readFilter === 'unread' && n.isRead) return false;
      if (readFilter === 'read' && !n.isRead) return false;
      if (typeFilter !== 'all' && n.type !== typeFilter) return false;
      return true;
    });
  }, [items, readFilter, typeFilter]);

  const markAsRead = useCallback(
    async (id: string) => {
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
      try {
        const updated = await markNotificationAsRead(id);
        setItems((prev) => prev.map((n) => (n.id === id ? updated : n)));
        syncAlerts();
      } catch {
        toastRef.current({ description: t('notifications.toast.error.markReadFailed'), variant: 'error' });
        void load('refresh');
      }
    },
    [load, syncAlerts, t, toastRef],
  );

  const markAsUnread = useCallback((id: string) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: false } : n)));
    setUnreadCount((prev) => prev + 1);
  }, []);

  const deleteOne = useCallback(
    async (id: string) => {
      const target = items.find((n) => n.id === id);
      setItems((prev) => prev.filter((n) => n.id !== id));
      if (target && !target.isRead) {
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }

      try {
        await deleteNotification(id);
        toastRef.current({ description: t('notifications.toast.success.deleted'), variant: 'success' });
        syncAlerts();
      } catch {
        toastRef.current({ description: t('notifications.toast.error.deleteFailed'), variant: 'error' });
        void load('refresh');
      }
    },
    [items, load, syncAlerts, t, toastRef],
  );

  const handleRowPress = useCallback(
    (n: Notification) => {
      if (!n.isRead) {
        void markAsRead(n.id);
      }
    },
    [markAsRead],
  );

  const markAllAsRead = useCallback(async () => {
    setItems((prev) => prev.map((row) => (row.isRead ? row : { ...row, isRead: true })));
    setUnreadCount(0);

    try {
      await markAllNotificationsAsRead();
      toastRef.current({ description: t('notifications.toast.success.markAllRead'), variant: 'success' });
      await load('refresh');
      syncAlerts();
    } catch {
      toastRef.current({ description: t('notifications.toast.error.markAllReadFailed'), variant: 'error' });
      void load('refresh');
    }
  }, [load, syncAlerts, t, toastRef]);

  const deleteAll = useCallback(async () => {
    setItems([]);
    setUnreadCount(0);

    try {
      await deleteAllNotifications();
      toastRef.current({ description: t('notifications.toast.success.deletedAll'), variant: 'success' });
      await load('refresh');
      syncAlerts();
    } catch {
      toastRef.current({ description: t('notifications.toast.error.deleteAllFailed'), variant: 'error' });
      void load('refresh');
    }
  }, [load, syncAlerts, t, toastRef]);

  return {
    items,
    visibleNotifications,
    loading,
    refreshing,
    error,
    readFilter,
    setReadFilter,
    typeFilter,
    setTypeFilter,
    unreadCount,
    markAsRead,
    markAsUnread,
    deleteOne,
    handleRowPress,
    markAllAsRead,
    deleteAll,
    reload: () => load('initial'),
    refresh: () => load('refresh'),
  };
}
