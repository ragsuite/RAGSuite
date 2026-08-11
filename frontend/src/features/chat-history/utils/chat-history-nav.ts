import type { Href } from 'expo-router';

import { CHAT_HISTORY_LIST_HREF } from '@/config/navigation';

export const chatHistoryListHref = CHAT_HISTORY_LIST_HREF;

export function chatQueryDetailRoute(queryId: string): Href {
  return `/(app)/history/${encodeURIComponent(queryId)}` as Href;
}
