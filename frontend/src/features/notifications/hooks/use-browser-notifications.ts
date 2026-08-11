import type { BrowserNotificationItem } from '@/features/notifications/utils/browser-notification-diff';

/**
 * Native: reference frontend only uses the browser Notification API.
 * Polling + unread badge still run via NotificationAlertsProvider.
 */
export function useBrowserNotifications(
  _unreadCount: number,
  _notifications: BrowserNotificationItem[],
): void {
  // no-op
}
