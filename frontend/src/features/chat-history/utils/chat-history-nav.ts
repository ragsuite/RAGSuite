import type { Href } from 'expo-router';

import { CHAT_HISTORY_LIST_HREF } from '@/config/navigation';
import type { HistoryKind } from '@/features/chat-history/types/chat-history.types';

export const chatHistoryListHref = CHAT_HISTORY_LIST_HREF;

export function chatQueryDetailRoute(queryId: string, kind: HistoryKind = 'chatbot'): Href {
  const encoded = encodeURIComponent(queryId);
  if (kind === 'search') {
    return `/(app)/history/${encoded}?kind=search` as Href;
  }
  return `/(app)/history/${encoded}` as Href;
}

export function parseHistoryKindParam(value: string | string[] | undefined): HistoryKind {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === 'search' ? 'search' : 'chatbot';
}
