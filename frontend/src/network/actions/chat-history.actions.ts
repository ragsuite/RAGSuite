import type {
  ChatHistoryApiRow,
  ChatHistoryExportParams,
  ChatHistoryQueryParams,
} from '@/features/chat-history/types/chat-history.types';
import {
  parseChatHistoryDetailResponse,
  parseChatHistoryRowsResponse,
} from '@/features/chat-history/utils/chat-history-api';
import { API_CONFIG, buildApiUrl } from '@/network/apiUrl';
import { fetchWithAuth, get } from '@/network/request';
import { extractApiErrorMessage } from '@/utils/api-error';

function buildChatHistoryQuery(params: ChatHistoryQueryParams): string {
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

  return `${API_CONFIG.CHAT_HISTORY}?${search.toString()}`;
}

function buildChatHistoryExportQuery(params: ChatHistoryExportParams): string {
  const search = new URLSearchParams();
  search.set('fmt', params.fmt);

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
  const response = await get<unknown>(buildChatHistoryQuery(params));
  const rows = parseChatHistoryRowsResponse(response);
  if (!rows) {
    throw new Error('errors.history.invalidResponse');
  }
  return rows;
}

export async function handleGetChatMessage(messageId: string, projectId?: string): Promise<ChatHistoryApiRow> {
  const search = new URLSearchParams();
  if (projectId?.trim()) {
    search.set('project_id', projectId.trim());
  }

  const suffix = search.size > 0 ? `?${search.toString()}` : '';
  const response = await get<unknown>(`${API_CONFIG.chatMessage(messageId)}${suffix}`);
  const row = parseChatHistoryDetailResponse(response);
  if (!row) {
    throw new Error('errors.history.invalidMessageResponse');
  }
  return row;
}

export async function handleExportChatHistory(params: ChatHistoryExportParams): Promise<string> {
  const response = await fetchWithAuth(buildChatHistoryExportQuery(params));

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
