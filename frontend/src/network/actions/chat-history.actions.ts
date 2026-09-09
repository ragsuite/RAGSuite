import type {
  ChatHistoryApiRow,
  ChatHistoryExportParams,
  ChatHistoryQueryParams,
  HistoryKind,
} from '@/features/chat-history/types/chat-history.types';
import { historyKindToMessageType } from '@/features/chat-history/types/chat-history.types';
import {
  parseChatHistoryDetailResponse,
  parseChatHistoryRowsResponse,
} from '@/features/chat-history/utils/chat-history-api';
import { API_CONFIG } from '@/network/apiUrl';
import { fetchWithAuth, get } from '@/network/request';
import { extractApiErrorMessage } from '@/utils/api-error';

function historyListBaseUrl(kind: HistoryKind = 'chatbot'): string {
  return kind === 'search' ? API_CONFIG.SEARCH_HISTORY : API_CONFIG.CHAT_HISTORY;
}

function historyMessageUrl(kind: HistoryKind, messageId: string): string {
  return kind === 'search' ? API_CONFIG.searchMessage(messageId) : API_CONFIG.chatMessage(messageId);
}

function buildHistoryListQuery(params: ChatHistoryQueryParams): string {
  const kind = params.kind ?? 'chatbot';
  const search = new URLSearchParams();
  search.set('limit', String(params.limit));
  search.set('offset', String(params.offset));

  if (params.q?.trim()) {
    search.set('q', params.q.trim());
  }
  if (params.sessionId?.trim()) {
    search.set('session_id', params.sessionId.trim());
  }
  if (params.projectId?.trim()) {
    search.set('project_id', params.projectId.trim());
  }
  if (params.paginated) {
    search.set('paginated', 'true');
  }

  return `${historyListBaseUrl(kind)}?${search.toString()}`;
}

function buildChatHistoryExportQuery(params: ChatHistoryExportParams): string {
  const search = new URLSearchParams();
  search.set('fmt', params.fmt);
  search.set('message_type', params.messageType ?? 'chat');

  if (params.q?.trim()) {
    search.set('q', params.q.trim());
  }
  if (params.sessionId?.trim()) {
    search.set('session_id', params.sessionId.trim());
  }
  if (params.projectId?.trim()) {
    search.set('project_id', params.projectId.trim());
  }
  if (params.maxRows != null) {
    search.set('max_rows', String(params.maxRows));
  }

  return `${API_CONFIG.CHAT_HISTORY_EXPORT}?${search.toString()}`;
}

export async function handleGetChatHistory(params: ChatHistoryQueryParams): Promise<ChatHistoryApiRow[]> {
  const response = await get<unknown>(buildHistoryListQuery(params));
  const parsed = parseChatHistoryRowsResponse(response);
  if (!parsed) {
    throw new Error('errors.history.invalidResponse');
  }
  return parsed.rows;
}

export type ChatHistoryPageResult = {
  rows: ChatHistoryApiRow[];
  total: number;
  limit: number;
  offset: number;
};

export async function handleGetChatHistoryPage(
  params: ChatHistoryQueryParams,
): Promise<ChatHistoryPageResult> {
  const response = await get<unknown>(
    buildHistoryListQuery({ ...params, paginated: true }),
  );
  const parsed = parseChatHistoryRowsResponse(response);
  if (!parsed || parsed.total == null) {
    throw new Error('errors.history.invalidResponse');
  }
  return {
    rows: parsed.rows,
    total: parsed.total,
    limit: params.limit,
    offset: params.offset,
  };
}

export async function handleGetChatMessage(
  messageId: string,
  options?: { projectId?: string; kind?: HistoryKind },
): Promise<ChatHistoryApiRow> {
  const kind = options?.kind ?? 'chatbot';
  const search = new URLSearchParams();
  if (options?.projectId?.trim()) {
    search.set('project_id', options.projectId.trim());
  }

  const suffix = search.size > 0 ? `?${search.toString()}` : '';
  const response = await get<unknown>(`${historyMessageUrl(kind, messageId)}${suffix}`);
  const row = parseChatHistoryDetailResponse(response);
  if (!row) {
    throw new Error('errors.history.invalidMessageResponse');
  }
  return row;
}

export async function handleExportChatHistory(params: ChatHistoryExportParams): Promise<string> {
  const response = await fetchWithAuth(
    buildChatHistoryExportQuery({
      ...params,
      messageType: params.messageType ?? 'chat',
    }),
  );

  if (!response.ok) {
    let message = 'Failed to export chat history.';
    try {
      const body = await response.json();
      message = extractApiErrorMessage(body, message);
    } catch {
      // Response body is not JSON (e.g. CSV) — keep default message.
    }
    throw new Error(message);
  }

  return response.text();
}

export { historyKindToMessageType };
