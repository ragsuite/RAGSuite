import type {
  HistorySessionListParams,
  HistorySessionListResponse,
} from '@/features/chat-history/types/chat-history.types';
import { handleGetHistorySessions } from '@/network/actions/chat-sessions.actions';

export async function fetchHistorySessions(
  params: HistorySessionListParams,
): Promise<HistorySessionListResponse> {
  return handleGetHistorySessions(params);
}
