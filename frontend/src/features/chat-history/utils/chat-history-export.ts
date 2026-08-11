import type { ChatQueryDetail } from '@/features/chat-history/types/chat-history.types';
import { formatQueryTimestamp } from '@/features/chat-history/utils/chat-history-display';

export function queriesToDetailedCsv(details: ChatQueryDetail[]): string {
  const headers = [
    'id',
    'session_id',
    'message_id',
    'question',
    'assistant_answer',
    'timestamp',
    'latency_ms',
    'status',
    'confidence',
    'tag',
  ];
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = details.map((q) =>
    [
      q.id,
      q.sessionId,
      q.messageId,
      q.question,
      q.assistantAnswer,
      formatQueryTimestamp(q.createdAt),
      String(q.latencyMs),
      q.status,
      q.confidence == null ? '' : String(q.confidence),
      q.tagLabel,
    ]
      .map(escape)
      .join(','),
  );
  return [headers.join(','), ...lines].join('\n');
}

export function queriesToDetailedJson(details: ChatQueryDetail[]): string {
  return JSON.stringify(details, null, 2);
}
