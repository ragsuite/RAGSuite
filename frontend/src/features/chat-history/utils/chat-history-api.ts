import type { ChatHistoryApiRow } from '@/features/chat-history/types/chat-history.types';

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeSources(value: unknown): ChatHistoryApiRow['sources'] {
  if (value == null) return null;
  if (!Array.isArray(value)) return null;
  const out: NonNullable<ChatHistoryApiRow['sources']> = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const title = asString(record.title);
    const url = asString(record.url);
    if (title && url) out.push({ title, url });
  }
  return out;
}

export function normalizeChatHistoryRow(raw: unknown): ChatHistoryApiRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const id = asString(record.id);
  const userMessage = asString(record.user_message);
  if (!id || userMessage == null) return null;

  const executionSnapshot = record.execution_snapshot;
  const row: ChatHistoryApiRow = {
    id,
    session_id: asString(record.session_id) ?? '',
    message_id: asString(record.message_id) ?? '',
    user_message: userMessage,
    assistant_response: asString(record.assistant_response) ?? '',
    message_type: asString(record.message_type) ?? 'chat',
    sources: normalizeSources(record.sources),
    feedback: asString(record.feedback),
    feedback_rating: asNumber(record.feedback_rating),
    feedback_text: asString(record.feedback_text),
    context_tags: Array.isArray(record.context_tags)
      ? (record.context_tags.filter((t) => typeof t === 'string') as string[])
      : null,
    created_at: asString(record.created_at) ?? new Date().toISOString(),
    history_status: asString(record.history_status) ?? 'success',
    history_confidence: asNumber(record.history_confidence),
    history_total_ms: asNumber(record.history_total_ms) ?? 0,
    feedback_moderation: record.feedback_moderation ?? null,
  };

  if (executionSnapshot && typeof executionSnapshot === 'object') {
    row.execution_snapshot = executionSnapshot as ChatHistoryApiRow['execution_snapshot'];
  }

  return row;
}

export function parseChatHistoryDetailResponse(body: unknown): ChatHistoryApiRow | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  const direct = normalizeChatHistoryRow(record);
  if (direct) return direct;
  const nested = record.data ?? record.item ?? record.event;
  if (nested && typeof nested === 'object') {
    return parseChatHistoryDetailResponse(nested);
  }
  return null;
}

export function parseChatHistoryRowsResponse(body: unknown): ChatHistoryApiRow[] | null {
  if (!body) return null;
  let rawRows: unknown[] | null = null;
  if (Array.isArray(body)) {
    rawRows = body;
  } else if (typeof body === 'object') {
    const record = body as Record<string, unknown>;
    const items = record.items ?? record.events ?? record.history ?? record.data;
    if (Array.isArray(items)) rawRows = items;
    if (typeof record.total === 'number' && Array.isArray(record.items)) {
      rawRows = record.items;
    }
  }
  if (!rawRows) return null;
  return rawRows
    .map(normalizeChatHistoryRow)
    .filter((row): row is ChatHistoryApiRow => row != null);
}
