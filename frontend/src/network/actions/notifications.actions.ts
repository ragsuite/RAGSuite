import type {
  NotificationResponse,
  UnreadCountResponse,
} from '@/features/notifications/types/notification.api.types';
import { API_CONFIG } from '@/network/apiUrl';
import { deleteApi, get, put } from '@/network/request';

export type GetNotificationsParams = {
  skip?: number;
  limit?: number;
  unreadOnly?: boolean;
};

function buildNotificationsQuery(params?: GetNotificationsParams): string {
  const search = new URLSearchParams();
  search.set('skip', String(params?.skip ?? 0));
  search.set('limit', String(params?.limit ?? 50));
  search.set('unread_only', String(params?.unreadOnly ?? false));
  return `${API_CONFIG.NOTIFICATIONS}?${search.toString()}`;
}

export async function handleGetNotifications(
  params?: GetNotificationsParams,
): Promise<NotificationResponse[]> {
  const response = await get<NotificationResponse[]>(buildNotificationsQuery(params));
  return Array.isArray(response) ? response : [];
}

export async function handleGetUnreadNotificationCount(): Promise<number> {
  const response = (await get<UnreadCountResponse>(API_CONFIG.NOTIFICATIONS_UNREAD_COUNT)) as UnreadCountResponse;
  if (typeof response.count === 'number') {
    return response.count;
  }
  if (typeof response.unread_count === 'number') {
    return response.unread_count;
  }
  return 0;
}

export async function handleMarkNotificationAsRead(id: string): Promise<NotificationResponse> {
  return (await put(API_CONFIG.notificationRead(id))) as NotificationResponse;
}

export async function handleMarkAllNotificationsAsRead(): Promise<void> {
  await put(API_CONFIG.NOTIFICATIONS_READ_ALL);
}

export async function handleDeleteNotification(id: string): Promise<void> {
  await deleteApi(API_CONFIG.notification(id));
}

export async function handleDeleteAllNotifications(): Promise<void> {
  await deleteApi(API_CONFIG.NOTIFICATIONS);
}
