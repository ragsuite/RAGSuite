import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';

import { useAuthenticatedBootstrap } from '@/features/auth/hooks/use-authenticated-bootstrap';
import { useBrowserNotifications } from '@/features/notifications/hooks/use-browser-notifications';
import {
  fetchNotifications,
  fetchUnreadNotificationCount,
} from '@/features/notifications/services/notification.service';
import type { Notification } from '@/features/notifications/types/notification.types';
import {
  OPEN_NOTIFICATION_INBOX_EVENT,
  type BrowserNotificationItem,
} from '@/features/notifications/utils/browser-notification-diff';
import { useAppShell } from '@/shared/components/navigation/app-shell-provider';

const POLL_INTERVAL_MS = 60_000;

type NotificationAlertsContextValue = {
  unreadCount: number;
  notifications: Notification[];
  refresh: () => Promise<void>;
};

const NotificationAlertsContext = createContext<NotificationAlertsContextValue | null>(null);

type Props = {
  children: React.ReactNode;
};

function mapForBrowser(items: Notification[]): BrowserNotificationItem[] {
  return items.map((item) => ({
    id: item.id,
    title: item.title,
    message: item.message,
    type: item.type,
    read: item.isRead,
  }));
}

export function NotificationAlertsProvider({ children }: Props) {
  const { isReady } = useAuthenticatedBootstrap();
  const { openNotificationsPanel } = useAppShell();
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isPageVisible, setIsPageVisible] = useState(true);
  const pollInFlightRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!isReady || pollInFlightRef.current) return;
    pollInFlightRef.current = true;
    try {
      const [count, list] = await Promise.all([
        fetchUnreadNotificationCount(),
        fetchNotifications({ skip: 0, limit: 50, unreadOnly: false }),
      ]);
      setUnreadCount(count);
      setNotifications(list);
    } catch {
      // Keep last known badge/list; next poll retries.
    } finally {
      pollInFlightRef.current = false;
    }
  }, [isReady]);

  useEffect(() => {
    if (!isReady) return;
    void refresh();
  }, [isReady, refresh]);

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
      void refresh();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [isReady, isPageVisible, refresh]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const onFocus = () => {
      void refresh();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const handleOpenInbox = () => {
      openNotificationsPanel();
    };
    window.addEventListener(OPEN_NOTIFICATION_INBOX_EVENT, handleOpenInbox);
    return () => window.removeEventListener(OPEN_NOTIFICATION_INBOX_EVENT, handleOpenInbox);
  }, [openNotificationsPanel]);

  const browserNotifications = useMemo(() => mapForBrowser(notifications), [notifications]);
  useBrowserNotifications(unreadCount, browserNotifications);

  const value = useMemo(
    () => ({
      unreadCount,
      notifications,
      refresh,
    }),
    [notifications, refresh, unreadCount],
  );

  return (
    <NotificationAlertsContext.Provider value={value}>{children}</NotificationAlertsContext.Provider>
  );
}

export function useNotificationAlerts(): NotificationAlertsContextValue {
  const context = useContext(NotificationAlertsContext);
  if (!context) {
    return {
      unreadCount: 0,
      notifications: [],
      refresh: async () => undefined,
    };
  }
  return context;
}
