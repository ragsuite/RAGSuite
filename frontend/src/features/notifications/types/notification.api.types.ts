export type NotificationResponse = {
  id: string;
  user_id: number;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  action_url?: string | null;
  created_at: string;
};

export type UnreadCountResponse = {
  count?: number;
  unread_count?: number;
};
