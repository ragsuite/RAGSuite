import { Platform } from 'react-native';

export const ADMIN_CHAT_DELETED_EVENT = 'ragsuite:admin-chat-deleted';

export type AdminChatDeletedDetail = {
  sessionIds: string[];
  projectId?: string;
};

type AdminChatDeletedListener = (detail: AdminChatDeletedDetail) => void;

const nativeListeners = new Set<AdminChatDeletedListener>();

export function notifyAdminChatSessionsDeleted(
  sessionIds: string[],
  projectId?: string | null,
) {
  if (sessionIds.length === 0) return;

  const detail: AdminChatDeletedDetail = {
    sessionIds,
    projectId: projectId ?? undefined,
  };

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent<AdminChatDeletedDetail>(ADMIN_CHAT_DELETED_EVENT, { detail }),
    );
    return;
  }

  nativeListeners.forEach((listener) => listener(detail));
}

export function subscribeAdminChatSessionsDeleted(listener: AdminChatDeletedListener): () => void {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<AdminChatDeletedDetail>;
      if (custom.detail) listener(custom.detail);
    };
    window.addEventListener(ADMIN_CHAT_DELETED_EVENT, handler);
    return () => window.removeEventListener(ADMIN_CHAT_DELETED_EVENT, handler);
  }

  nativeListeners.add(listener);
  return () => nativeListeners.delete(listener);
}
