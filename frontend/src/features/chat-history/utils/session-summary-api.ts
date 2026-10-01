import type {
  HistoryKind,
  HistorySessionListResponse,
  HistorySessionSummaryItem,
} from '@/features/chat-history/types/chat-history.types';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function pickNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function unwrapPayload(body: unknown): Record<string, unknown> | null {
  const root = asRecord(body);
  if (!root) return null;
  const data = asRecord(root.data);
  if (data && Array.isArray(data.items)) return data;
  if (Array.isArray(root.items)) return root;
  return null;
}

function mapSessionItem(raw: unknown): HistorySessionSummaryItem | null {
  const record = asRecord(raw);
  if (!record) return null;
  const sessionId =
    pickString(record.session_id) ?? pickString(record.sessionId) ?? '';
  if (!sessionId) return null;
  const emailsRaw = record.transcript_emails ?? record.transcriptEmails;
  const transcriptEmails = Array.isArray(emailsRaw)
    ? emailsRaw.filter((e): e is string => typeof e === 'string')
    : [];

  return {
    sessionId,
    preview: pickString(record.preview) ?? '',
    lastAt: pickString(record.last_at) ?? pickString(record.lastAt),
    messageCount: pickNumber(record.message_count) ?? pickNumber(record.messageCount) ?? 0,
    transcriptEmails,
    feedbackCount:
      pickNumber(record.feedback_count) ?? pickNumber(record.feedbackCount) ?? undefined,
  };
}

export function parseHistorySessionListResponse(body: unknown): HistorySessionListResponse | null {
  const payload = unwrapPayload(body);
  if (!payload) return null;
  const itemsRaw = payload.items;
  if (!Array.isArray(itemsRaw)) return null;
  const items = itemsRaw
    .map(mapSessionItem)
    .filter((item): item is HistorySessionSummaryItem => item != null);
  const total = pickNumber(payload.total) ?? items.length;
  const limit = pickNumber(payload.limit) ?? items.length;
  const offset = pickNumber(payload.offset) ?? 0;
  return { items, total, limit, offset };
}

export function historyKindToSessionsSummaryUrl(kind: HistoryKind): string {
  return kind === 'search'
    ? '/api/v1/search/sessions/summary'
    : '/api/v1/chat/sessions/summary';
}
