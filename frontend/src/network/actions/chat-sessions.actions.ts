import type {
  HistoryKind,
  HistorySessionListParams,
  HistorySessionListResponse,
} from '@/features/chat-history/types/chat-history.types';
import { parseHistorySessionListResponse } from '@/features/chat-history/utils/session-summary-api';
import { historyKindToSessionsSummaryUrl } from '@/features/chat-history/utils/session-summary-api';
import { get } from '@/network/request';

function buildSessionSummaryQuery(params: HistorySessionListParams): string {
  const kind = params.kind ?? 'chatbot';
  const search = new URLSearchParams();
  search.set('limit', String(params.limit));
  search.set('offset', String(params.offset));
  if (params.q?.trim()) search.set('q', params.q.trim());
  if (params.projectId?.trim()) search.set('project_id', params.projectId.trim());
  if (params.dateFrom) search.set('date_from', params.dateFrom);
  return `${historyKindToSessionsSummaryUrl(kind)}?${search.toString()}`;
}

export async function handleGetHistorySessions(
  params: HistorySessionListParams,
): Promise<HistorySessionListResponse> {
  const response = await get<unknown>(buildSessionSummaryQuery(params));
  const parsed = parseHistorySessionListResponse(response);
  if (!parsed) {
    throw new Error('errors.history.invalidResponse');
  }
  return parsed;
}

export type { HistoryKind };
