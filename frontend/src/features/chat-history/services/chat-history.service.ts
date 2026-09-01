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
  handleGetChatHistoryPage,
  handleGetChatMessage,
} from '@/network/actions/chat-history.actions';
import { deriveOffsetPagination } from '@/shared/utils/paginated-list';

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
  apiTotal?: number,
): ChatHistoryListResponse {
  const items = rows.map(mapRowToQueryListItem);
  const pagination = deriveOffsetPagination({
    mergedLength: params.offset + items.length,
    pageLength: items.length,
    limit: params.limit,
    apiTotal,
  });

  return {
    items,
    limit: params.limit,
    offset: params.offset,
    hasMore: pagination.hasMore,
    total: pagination.total,
  };
}

export async function fetchChatHistoryQueries(
  params: ChatHistoryQueryParams,
): Promise<ChatHistoryListResponse> {
  const page = await handleGetChatHistoryPage(params);
  const rows = sortRowsNewestFirst(page.rows);
  return buildListResponse(params, rows, page.total);
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
