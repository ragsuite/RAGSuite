export type BrowserNotificationItem = {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
};

export const BROWSER_NOTIFICATIONS_INITIALIZED_KEY = 'browser-notifications-initialized';
export const BROWSER_NOTIFICATIONS_IDS_KEY = 'browser-notifications-ids';

export function getUnreadIds(notifications: BrowserNotificationItem[]): Set<string> {
  return new Set(notifications.filter((item) => !item.read).map((item) => item.id));
}

export type BrowserNotificationDiff = {
  shouldInitializeOnly: boolean;
  newNotifications: BrowserNotificationItem[];
  fallbackWhenCountIncreased: BrowserNotificationItem | null;
  nextUnreadIds: Set<string>;
};

/**
 * Mirrors reference frontend first-load skip + new-unread selection (max 3).
 */
export function diffBrowserNotifications(input: {
  initialized: boolean;
  unreadCount: number;
  previousCount: number;
  previousIds: Set<string>;
  notifications: BrowserNotificationItem[];
}): BrowserNotificationDiff {
  const unreadNotifications = input.notifications.filter((item) => !item.read);
  const nextUnreadIds = getUnreadIds(input.notifications);

  if (!input.initialized) {
    if (input.notifications.length > 0 || input.unreadCount >= 0) {
      return {
        shouldInitializeOnly: true,
        newNotifications: [],
        fallbackWhenCountIncreased: null,
        nextUnreadIds,
      };
    }
    return {
      shouldInitializeOnly: false,
      newNotifications: [],
      fallbackWhenCountIncreased: null,
      nextUnreadIds,
    };
  }

  const hasNewNotifications =
    input.unreadCount > input.previousCount ||
    Array.from(nextUnreadIds).some((id) => !input.previousIds.has(id));

  if (!hasNewNotifications) {
    return {
      shouldInitializeOnly: false,
      newNotifications: [],
      fallbackWhenCountIncreased: null,
      nextUnreadIds,
    };
  }

  const newNotifications = unreadNotifications
    .filter((item) => !input.previousIds.has(item.id))
    .slice(0, 3);

  if (newNotifications.length > 0) {
    return {
      shouldInitializeOnly: false,
      newNotifications,
      fallbackWhenCountIncreased: null,
      nextUnreadIds,
    };
  }

  if (input.unreadCount > input.previousCount && unreadNotifications.length > 0) {
    return {
      shouldInitializeOnly: false,
      newNotifications: [],
      fallbackWhenCountIncreased: unreadNotifications[0] ?? null,
      nextUnreadIds,
    };
  }

  return {
    shouldInitializeOnly: false,
    newNotifications: [],
    fallbackWhenCountIncreased: null,
    nextUnreadIds,
  };
}

export function formatBrowserNotificationBody(message: string): string {
  let formatted = message.trim();
  if (formatted.length > 120) {
    formatted = `${formatted.substring(0, 117)}...`;
  }
  if (formatted.length > 0) {
    formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);
  }
  return formatted;
}

export function browserNotificationIcon(type: string): string {
  const iconMap: Record<string, string> = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ',
  };
  return iconMap[type] || '•';
}

export const OPEN_NOTIFICATION_INBOX_EVENT = 'openNotificationInbox';
