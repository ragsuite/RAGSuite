import { useEffect, useRef } from 'react';

import {
  BROWSER_NOTIFICATIONS_IDS_KEY,
  BROWSER_NOTIFICATIONS_INITIALIZED_KEY,
  OPEN_NOTIFICATION_INBOX_EVENT,
  browserNotificationIcon,
  diffBrowserNotifications,
  formatBrowserNotificationBody,
  type BrowserNotificationItem,
} from '@/features/notifications/utils/browser-notification-diff';

function getInitializedState(): boolean {
  try {
    return sessionStorage.getItem(BROWSER_NOTIFICATIONS_INITIALIZED_KEY) === 'true';
  } catch {
    return false;
  }
}

function setInitializedState(value: boolean): void {
  try {
    sessionStorage.setItem(BROWSER_NOTIFICATIONS_INITIALIZED_KEY, value ? 'true' : 'false');
  } catch {
    // ignore quota / private mode
  }
}

function getStoredNotificationIds(): Set<string> {
  try {
    const stored = sessionStorage.getItem(BROWSER_NOTIFICATIONS_IDS_KEY);
    if (stored) {
      return new Set(JSON.parse(stored) as string[]);
    }
  } catch {
    // ignore
  }
  return new Set();
}

function setStoredNotificationIds(ids: Set<string>): void {
  try {
    sessionStorage.setItem(BROWSER_NOTIFICATIONS_IDS_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // ignore
  }
}

function showOsNotification(item: BrowserNotificationItem): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;

  const icon = browserNotificationIcon(item.type);
  const formattedTitle = item.title.trim();
  const formattedMessage = formatBrowserNotificationBody(item.message);
  const isImportant = item.type === 'error' || item.type === 'warning';

  const openInbox = () => {
    window.focus();
    window.dispatchEvent(new CustomEvent(OPEN_NOTIFICATION_INBOX_EVENT));
  };

  try {
    const browserNotification = new Notification(`${icon} ${formattedTitle}`, {
      body: formattedMessage,
      tag: item.id,
      requireInteraction: isImportant,
      silent: false,
    });

    browserNotification.onclick = () => {
      openInbox();
      browserNotification.close();
    };

    const autoCloseTime = isImportant ? 15_000 : 8_000;
    setTimeout(() => browserNotification.close(), autoCloseTime);
  } catch {
    try {
      const simple = new Notification(`${icon} ${formattedTitle}`, { body: formattedMessage });
      simple.onclick = () => {
        openInbox();
        simple.close();
      };
      setTimeout(() => simple.close(), isImportant ? 15_000 : 8_000);
    } catch {
      // Permission or OS notification failure — ignore
    }
  }
}

/**
 * Exact parity with reference `useBrowserNotifications`:
 * request permission after sign-in, skip first hydrate, toast new unread via Notification API.
 */
export function useBrowserNotifications(
  unreadCount: number,
  notifications: BrowserNotificationItem[],
): void {
  const previousCountRef = useRef(-1);
  const previousNotificationIdsRef = useRef(new Set<string>());
  const permissionRequestedRef = useRef(false);
  const initializedRef = useRef(false);

  if (!initializedRef.current) {
    initializedRef.current = getInitializedState();
    if (initializedRef.current) {
      previousNotificationIdsRef.current = getStoredNotificationIds();
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'default' && !permissionRequestedRef.current) {
      permissionRequestedRef.current = true;
      void Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;

    const currentPermission = Notification.permission;
    if (currentPermission !== 'granted') {
      if (currentPermission === 'default' && !permissionRequestedRef.current) {
        permissionRequestedRef.current = true;
        void Notification.requestPermission();
      }
      return;
    }

    const diff = diffBrowserNotifications({
      initialized: initializedRef.current,
      unreadCount,
      previousCount: previousCountRef.current,
      previousIds: previousNotificationIdsRef.current,
      notifications,
    });

    if (diff.shouldInitializeOnly) {
      previousCountRef.current = unreadCount;
      previousNotificationIdsRef.current = diff.nextUnreadIds;
      initializedRef.current = true;
      setInitializedState(true);
      setStoredNotificationIds(diff.nextUnreadIds);
      return;
    }

    for (const item of diff.newNotifications) {
      showOsNotification(item);
    }
    if (diff.fallbackWhenCountIncreased) {
      showOsNotification(diff.fallbackWhenCountIncreased);
    }

    previousCountRef.current = unreadCount;
    previousNotificationIdsRef.current = diff.nextUnreadIds;
    setStoredNotificationIds(diff.nextUnreadIds);
  }, [unreadCount, notifications]);
}
