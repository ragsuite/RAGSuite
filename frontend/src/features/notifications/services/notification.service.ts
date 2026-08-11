import {
  handleDeleteAllNotifications,
  handleDeleteNotification,
  handleGetNotifications,
  handleGetUnreadNotificationCount,
  handleMarkAllNotificationsAsRead,
  handleMarkNotificationAsRead,
  type GetNotificationsParams,
} from '@/network/actions/notifications.actions';
import type { Notification } from '@/features/notifications/types/notification.types';
import { mapNotificationResponse } from '@/features/notifications/utils/notification-mappers';
import { API_CONFIG } from '@/network/apiUrl';

export const NOTIFICATIONS_API = {
  list: API_CONFIG.NOTIFICATIONS,
  unreadCount: API_CONFIG.NOTIFICATIONS_UNREAD_COUNT,
  readAll: API_CONFIG.NOTIFICATIONS_READ_ALL,
  read: API_CONFIG.notificationRead,
  item: API_CONFIG.notification,
} as const;

export type FetchNotificationsParams = GetNotificationsParams;

export function formatNotificationTime(iso: string, now: Date = new Date()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Math.max(0, now.getTime() - t);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export async function fetchNotifications(params?: FetchNotificationsParams): Promise<Notification[]> {
  const rows = await handleGetNotifications(params);
  return rows.map(mapNotificationResponse);
}

export async function fetchUnreadNotificationCount(): Promise<number> {
  return handleGetUnreadNotificationCount();
}

export async function markNotificationAsRead(id: string): Promise<Notification> {
  const row = await handleMarkNotificationAsRead(id);
  return mapNotificationResponse(row);
}

export async function markAllNotificationsAsRead(): Promise<void> {
  await handleMarkAllNotificationsAsRead();
}

export async function deleteNotification(id: string): Promise<void> {
  await handleDeleteNotification(id);
}

export async function deleteAllNotifications(): Promise<void> {
  await handleDeleteAllNotifications();
}
