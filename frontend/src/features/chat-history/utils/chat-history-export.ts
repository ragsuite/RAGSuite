import type { ChatQueryDetail, HistoryKind } from '@/features/chat-history/types/chat-history.types';
import { historyKindToMessageType } from '@/features/chat-history/types/chat-history.types';
import { formatQueryTimestamp } from '@/features/chat-history/utils/chat-history-display';
import { downloadTextFile } from '@/shared/utils/download-text-file';

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

export function buildChatHistoryListExportFilename(
  format: 'csv' | 'json',
  kind: HistoryKind = 'chatbot',
): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const prefix = historyKindToMessageType(kind);
  return `${prefix}-history-export-${stamp}.${format}`;
}

export function mimeTypeForChatHistoryExport(format: 'csv' | 'json'): string {
  return format === 'json' ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8';
}

/** Triggers a browser download (web) or native share/save sheet. */
export async function deliverChatHistoryListExport(options: {
  content: string;
  format: 'csv' | 'json';
  kind?: HistoryKind;
}): Promise<boolean> {
  if (!options.content.trim()) return false;
  const result = await downloadTextFile({
    content: options.content,
    filename: buildChatHistoryListExportFilename(options.format, options.kind),
    mimeType: mimeTypeForChatHistoryExport(options.format),
  });
  return result.success;
}
