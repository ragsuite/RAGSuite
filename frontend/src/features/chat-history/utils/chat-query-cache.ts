import type { ChatQueryDetail, ChatQueryListItem } from '@/features/chat-history/types/chat-history.types';

const listCache = new Map<string, ChatQueryListItem>();
const detailCache = new Map<string, ChatQueryDetail>();

export function cacheChatQueryListItem(item: ChatQueryListItem): void {
  listCache.set(item.id, item);
}

export function getCachedChatQueryListItem(queryId: string): ChatQueryListItem | undefined {
  return listCache.get(queryId);
}

export function cacheChatQueryDetail(detail: ChatQueryDetail): void {
  detailCache.set(detail.messageId, detail);
  if (detail.id !== detail.messageId) {
    detailCache.set(detail.id, detail);
  }
}

export function getCachedChatQueryDetail(messageId: string): ChatQueryDetail | undefined {
  return detailCache.get(messageId);
}

/** @deprecated Use cacheChatQueryDetail */
export function cacheChatQuery(detail: ChatQueryDetail): void {
  cacheChatQueryDetail(detail);
}

/** @deprecated Use getCachedChatQueryDetail */
export function getCachedChatQuery(queryId: string): ChatQueryDetail | undefined {
  return getCachedChatQueryDetail(queryId);
}
