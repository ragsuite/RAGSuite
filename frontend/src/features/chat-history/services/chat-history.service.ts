import type {
  ChatHistoryExportParams,
  ChatHistoryListResponse,
  ChatHistoryQueryParams,
  ChatQueryDetail,
} from '@/features/chat-history/types/chat-history.types';
import {
  mapRowToQueryDetail,
  mapRowToQueryListItem,
  sortRowsNewestFirst,
} from '@/features/chat-history/utils/chat-query-mapper';
import { cacheChatQueryDetail } from '@/features/chat-history/utils/chat-query-cache';
import { API_CONFIG } from '@/network/apiUrl';
import {
  handleExportChatHistory,
  handleGetChatHistory,
  handleGetChatMessage,
} from '@/network/actions/chat-history.actions';

export const CHAT_HISTORY_API = {
  list: API_CONFIG.CHAT_HISTORY,
  export: API_CONFIG.CHAT_HISTORY_EXPORT,
  message: API_CONFIG.chatMessage,
} as const;

export {
  cacheChatQueryDetail,
  getCachedChatQueryDetail,
  cacheChatQueryListItem,
  getCachedChatQueryListItem,
} from '@/features/chat-history/utils/chat-query-cache';

function buildListResponse(
  params: ChatHistoryQueryParams,
  rows: ReturnType<typeof sortRowsNewestFirst>,
): ChatHistoryListResponse {
  const items = rows.map(mapRowToQueryListItem);
  const hasMore = items.length === params.limit;
  const loaded = params.offset + items.length;

  return {
    items,
    limit: params.limit,
    offset: params.offset,
    hasMore,
    total: hasMore ? loaded + 1 : loaded,
  };
}

export async function fetchChatHistoryQueries(
  params: ChatHistoryQueryParams,
): Promise<ChatHistoryListResponse> {
  const rows = sortRowsNewestFirst(await handleGetChatHistory(params));
  return buildListResponse(params, rows);
}

export async function fetchChatQueryById(messageId: string): Promise<ChatQueryDetail | null> {
  const row = await handleGetChatMessage(messageId);
  const detail = mapRowToQueryDetail(row);
  cacheChatQueryDetail(detail);
  return detail;
}

export async function exportChatHistory(params: ChatHistoryExportParams): Promise<string> {
  return handleExportChatHistory(params);
}
