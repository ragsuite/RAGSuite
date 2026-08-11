/**
 * Aligned with API payload (snake_case in wire format).
 * App state uses camelCase in `Notification`.
 */
export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export type Notification = {
  id: string;
  userId: number;
  title: string;
  message: string;
  type: NotificationType;
  isRead: boolean;
  actionUrl: string | null;
  createdAt: string;
};

export type ReadFilter = 'all' | 'unread' | 'read';

export type TypeFilter = 'all' | NotificationType;
