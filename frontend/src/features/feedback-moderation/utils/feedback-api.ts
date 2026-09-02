import type {
  FeedbackDetailPayload,
  FeedbackListItemPayload,
  FeedbackModerationRecord,
  FeedbackNegativeReasonStat,
  FeedbackSummaryPayload,
} from '@/features/feedback-moderation/types/feedback-moderation.types';
import { getRenderablePlainText } from '@/shared/utils/html-content';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function pickNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function pickBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function parseFeedbackValue(value: unknown, rating: number | null): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 'positive' || value === 'up') return true;
  if (value === 'false' || value === 'negative' || value === 'down') return false;
  if (rating != null) return rating > 2;
  return false;
}

function normalizeTopNegativeReasons(value: unknown): FeedbackNegativeReasonStat[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    const out: FeedbackNegativeReasonStat[] = [];
    for (const item of value) {
      if (typeof item === 'string') {
        const trimmed = item.trim();
        if (!trimmed) continue;
        const formatted = trimmed.match(/^(.+?)\s*\((\d+)\)$/);
        if (formatted) {
          out.push({ key: formatted[1].trim(), count: Number(formatted[2]) });
          continue;
        }
        out.push({ key: trimmed, count: 1 });
        continue;
      }
      const record = asRecord(item);
      if (!record) continue;
      const key =
        pickString(record.reason) ??
        pickString(record.key) ??
        pickString(record.tag) ??
        pickString(record.label);
      const count = pickNumber(record.count) ?? 1;
      if (key) out.push({ key, count });
    }
    return out;
  }

  const record = asRecord(value);
  if (record) {
    return Object.entries(record)
      .map(([key, count]) => (typeof count === 'number' ? { key, count } : null))
      .filter((item): item is FeedbackNegativeReasonStat => item != null);
  }

  return [];
}

function normalizeStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const items = value.filter((item): item is string => typeof item === 'string');
  return items.length > 0 ? items : null;
}

function normalizeSources(value: unknown): FeedbackDetailPayload['sources'] {
  if (!Array.isArray(value)) return null;
  const out: NonNullable<FeedbackDetailPayload['sources']> = [];
  for (const item of value) {
    const record = asRecord(item);
    if (!record) continue;
    const title = pickString(record.title);
    const url = pickString(record.url);
    if (title && url) out.push({ title, url });
  }
  return out.length > 0 ? out : null;
}

function normalizeModeration(value: unknown): FeedbackModerationRecord | null {
  const record = asRecord(value);
  if (!record) return null;
  return {
    internal_notes: pickString(record.internal_notes) ?? pickString(record.internalNotes),
    reviewed: pickBoolean(record.reviewed) ?? false,
    flagged: pickBoolean(record.flagged) ?? false,
    flag_reason: pickString(record.flag_reason) ?? pickString(record.flagReason),
    updated_at: pickString(record.updated_at) ?? pickString(record.updatedAt) ?? undefined,
  };
}

function truncatePreview(text: string, max = 160): string {
  const trimmed = getRenderablePlainText(text).replace(/\s+/g, ' ').trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

function resolveConfidence(record: Record<string, unknown>): number | null {
  const snapshot = asRecord(record.execution_snapshot);
  return (
    pickNumber(record.confidence_score) ??
    pickNumber(record.confidenceScore) ??
    pickNumber(record.history_confidence) ??
    pickNumber(snapshot?.confidence_score)
  );
}

function resolveTotalMs(record: Record<string, unknown>): number | null {
  const snapshot = asRecord(record.execution_snapshot);
  const timings = snapshot ? asRecord(snapshot.timings_ms) : null;
  return (
    pickNumber(record.total_ms) ??
    pickNumber(record.totalMs) ??
    pickNumber(record.history_total_ms) ??
    pickNumber(timings?.total_ms) ??
    null
  );
}

function resolveLlmModel(record: Record<string, unknown>): string | null {
  const snapshot = asRecord(record.execution_snapshot);
  const runtime = snapshot ? asRecord(snapshot.runtime_params) : null;
  const provider =
    pickString(record.llm_provider) ??
    pickString(record.llmProvider) ??
    pickString(runtime?.llm_provider);
  const model =
    pickString(record.llm_model) ??
    pickString(record.llmModel) ??
    pickString(runtime?.llm_model);
  if (provider && model) {
    if (provider.toLowerCase() === model.toLowerCase() || model.toLowerCase().includes(provider.toLowerCase())) {
      return model;
    }
    return `${provider} / ${model}`;
  }
  return model ?? provider;
}

function resolveEmbeddingModel(record: Record<string, unknown>): string | null {
  const snapshot = asRecord(record.execution_snapshot);
  const runtime = snapshot ? asRecord(snapshot.runtime_params) : null;
  const provider =
    pickString(record.embedding_provider) ??
    pickString(record.embeddingProvider) ??
    pickString(runtime?.embedding_provider);
  const model =
    pickString(record.embedding_model) ??
    pickString(record.embeddingModel) ??
    pickString(runtime?.embedding_model);
  if (provider && model) {
    if (provider.toLowerCase() === model.toLowerCase() || model.toLowerCase().includes(provider.toLowerCase())) {
      return model;
    }
    return `${provider} / ${model}`;
  }
  return model ?? provider;
}

export function normalizeFeedbackModerationRow(raw: unknown): FeedbackListItemPayload | null {
  const record = asRecord(raw);
  if (!record) return null;

  const messageId = pickString(record.message_id) ?? pickString(record.messageId) ?? pickString(record.id);
  const userMessage =
    pickString(record.user_message) ??
    pickString(record.userMessage) ??
    pickString(record.query);
  if (!messageId || userMessage == null) return null;

  const assistantResponse =
    pickString(record.assistant_response) ??
    pickString(record.assistantResponse) ??
    pickString(record.answer) ??
    pickString(record.assistant_preview) ??
    pickString(record.assistantPreview) ??
    '';
  const rating = pickNumber(record.feedback_rating) ?? pickNumber(record.feedbackRating) ?? 0;

  return {
    id: messageId,
    message_id: messageId,
    session_id: pickString(record.session_id) ?? pickString(record.sessionId) ?? '',
    user_id: pickNumber(record.user_id) ?? pickNumber(record.userId) ?? 0,
    user_message: userMessage,
    assistant_preview:
      pickString(record.assistant_preview) ??
      pickString(record.assistantPreview) ??
      truncatePreview(assistantResponse),
    assistant_response_length:
      pickNumber(record.assistant_response_length) ??
      pickNumber(record.assistantResponseLength) ??
      assistantResponse.length,
    feedback: parseFeedbackValue(record.feedback, rating),
    feedback_rating: rating,
    feedback_text: pickString(record.feedback_text) ?? pickString(record.feedbackText),
    context_tags: normalizeStringArray(record.context_tags ?? record.contextTags),
    message_type:
      pickString(record.message_type) ?? pickString(record.messageType) ?? 'chat',
    created_at: pickString(record.created_at) ?? pickString(record.createdAt) ?? new Date().toISOString(),
    confidence_score: resolveConfidence(record),
    total_ms: resolveTotalMs(record),
    llm_model: resolveLlmModel(record),
    embedding_model: resolveEmbeddingModel(record),
    feedback_moderation: normalizeModeration(record.feedback_moderation ?? record.feedbackModeration),
  };
}

export function normalizeFeedbackDetailRow(raw: unknown): FeedbackDetailPayload | null {
  const base = normalizeFeedbackModerationRow(raw);
  if (!base) return null;

  const record = asRecord(raw);
  const assistantResponse =
    pickString(record?.assistant_response) ??
    pickString(record?.assistantResponse) ??
    base.assistant_preview;

  return {
    ...base,
    assistant_response: assistantResponse,
    sources: normalizeSources(record?.sources),
    execution_snapshot:
      record?.execution_snapshot && typeof record.execution_snapshot === 'object'
        ? (record.execution_snapshot as Record<string, unknown>)
        : null,
  };
}

export function parseFeedbackSummaryResponse(body: unknown): FeedbackSummaryPayload | null {
  const record = asRecord(body);
  if (!record) return null;
  const payload = asRecord(record.data) ?? record;

  const total = pickNumber(payload.total_count) ?? pickNumber(payload.totalCount);
  if (total == null) return null;

  return {
    total_count: total,
    positive_count: pickNumber(payload.positive_count) ?? pickNumber(payload.positiveCount) ?? 0,
    negative_count: pickNumber(payload.negative_count) ?? pickNumber(payload.negativeCount) ?? 0,
    positive_pct: pickNumber(payload.positive_pct) ?? pickNumber(payload.positivePct) ?? 0,
    negative_pct: pickNumber(payload.negative_pct) ?? pickNumber(payload.negativePct) ?? 0,
    avg_total_ms: pickNumber(payload.avg_total_ms) ?? pickNumber(payload.avgTotalMs) ?? 0,
    top_negative_reasons: normalizeTopNegativeReasons(payload.top_negative_reasons),
    low_confidence_negative_count:
      pickNumber(payload.low_confidence_negative_count) ??
      pickNumber(payload.lowConfidenceNegativeCount) ??
      0,
    flagged_count: pickNumber(payload.flagged_count) ?? pickNumber(payload.flaggedCount) ?? 0,
    reviewed_count: pickNumber(payload.reviewed_count) ?? pickNumber(payload.reviewedCount) ?? 0,
  };
}

export function parseFeedbackEntriesResponse(body: unknown): FeedbackListItemPayload[] | null {
  const page = parseFeedbackEntriesPageResponse(body);
  return page?.items ?? null;
}

export type FeedbackEntriesPagePayload = {
  items: FeedbackListItemPayload[];
  total: number;
  limit: number;
  offset: number;
};

export function parseFeedbackEntriesPageResponse(body: unknown): FeedbackEntriesPagePayload | null {
  if (!body) return null;

  let rawRows: unknown[] | null = null;
  let total: number | null = null;
  let limit: number | null = null;
  let offset: number | null = null;

  if (Array.isArray(body)) {
    rawRows = body;
    total = body.length;
    limit = body.length;
    offset = 0;
  } else {
    const record = asRecord(body);
    const items = record?.items ?? record?.entries ?? record?.data ?? record?.results;
    if (Array.isArray(items)) rawRows = items;
    total = pickNumber(record?.total);
    limit = pickNumber(record?.limit);
    offset = pickNumber(record?.offset);
  }

  if (!rawRows) return null;

  const parsedItems = rawRows
    .map(normalizeFeedbackModerationRow)
    .filter((row): row is FeedbackListItemPayload => row != null);

  return {
    items: parsedItems,
    total: total ?? parsedItems.length,
    limit: limit ?? parsedItems.length,
    offset: offset ?? 0,
  };
}

export function parseFeedbackModerationPatchResponse(body: unknown): FeedbackModerationRecord | null {
  const record = asRecord(body);
  if (!record) return null;
  const payload = asRecord(record.data) ?? record;
  return normalizeModeration(payload.feedback_moderation ?? payload);
}
