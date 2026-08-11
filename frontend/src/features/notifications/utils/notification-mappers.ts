import type { NotificationResponse } from '@/features/notifications/types/notification.api.types';
import type { Notification, NotificationType } from '@/features/notifications/types/notification.types';

const NOTIFICATION_TYPES: NotificationType[] = ['info', 'success', 'warning', 'error'];

function normalizeNotificationType(type: string): NotificationType {
  const normalized = type.trim().toLowerCase() as NotificationType;
  return NOTIFICATION_TYPES.includes(normalized) ? normalized : 'info';
}

export function mapNotificationResponse(row: NotificationResponse): Notification {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    message: row.message,
    type: normalizeNotificationType(row.type),
    isRead: row.is_read,
    actionUrl: row.action_url ?? null,
    createdAt: row.created_at,
  };
}
