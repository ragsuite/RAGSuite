import type {
  ChatHistoryApiRow,
  ChatHistoryExecutionSnapshot,
  ChatQueryDetail,
  ChatQueryListItem,
  ChatQueryTagTone,
  ChatQueryTimingSpan,
} from '@/features/chat-history/types/chat-history.types';
import { stripMarkdownToPlainText } from '@/features/chat-history/utils/strip-markdown-to-plain-text';

function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function isFailedStatus(status: string): boolean {
  return status === 'failed' || status === 'error';
}

function resolveConfidence(row: ChatHistoryApiRow): number | null {
  if (row.history_confidence != null) return row.history_confidence;
  return row.execution_snapshot?.confidence_score ?? null;
}

export function resolveQueryTag(row: ChatHistoryApiRow): { label: string; tone: ChatQueryTagTone } {
  const status = row.history_status;
  if (status === 'greeting_default' || status === 'greeting') {
    return { label: 'Greeting', tone: 'greeting' };
  }
  if (isFailedStatus(status)) {
    return { label: 'Failed', tone: 'failed' };
  }

  const tags = row.context_tags ?? [];
  if (tags.includes('greeting') || /^(hi|hello|hey)\b/i.test(row.user_message.trim())) {
    return { label: 'Greeting', tone: 'greeting' };
  }

  const conf = resolveConfidence(row);
  if (conf != null) {
    if (conf >= 60) return { label: 'High', tone: 'high' };
    if (conf >= 40) return { label: 'Medium', tone: 'medium' };
    if (conf > 0) return { label: 'Low', tone: 'low' };
  }

  return { label: 'Low', tone: 'low' };
}

export function mapRowToQueryListItem(row: ChatHistoryApiRow): ChatQueryListItem {
  const { label, tone } = resolveQueryTag(row);
  return {
    id: row.id,
    sessionId: row.session_id,
    messageId: row.message_id,
    question: row.user_message.trim() || '—',
    answerPreview: truncate(
      stripMarkdownToPlainText(row.assistant_response) || 'No response recorded.',
      160,
    ),
    createdAt: row.created_at,
    latencyMs: row.history_total_ms ?? row.execution_snapshot?.timings_ms?.total_ms ?? 0,
    status: isFailedStatus(row.history_status) ? 'failed' : 'success',
    confidence: resolveConfidence(row),
    tagLabel: label,
    tagTone: tone,
  };
}

function formatParamValue(value: unknown): string | number | boolean {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean' || typeof value === 'number') return value;
  return String(value);
}

function runtimeParamsToRecord(
  params: ChatHistoryExecutionSnapshot['runtime_params'] | undefined,
): Record<string, string | number | boolean> {
  if (!params) return {};
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key, formatParamValue(value)]),
  );
}

function buildTimingSpansFromSnapshot(snapshot: ChatHistoryExecutionSnapshot | null | undefined): ChatQueryTimingSpan[] {
  const timings = snapshot?.timings_ms;
  const total = timings?.total_ms ?? 0;

  const childSpan = (
    id: string,
    label: string,
    ms: number | null | undefined,
  ): ChatQueryTimingSpan => ({
    id,
    label,
    durationMs: ms ?? null,
    unavailable: ms == null,
    indent: 1,
  });

  const optionalChild = (
    id: string,
    label: string,
    ms: number | null | undefined,
  ): ChatQueryTimingSpan | null => {
    if (ms == null) return null;
    return childSpan(id, label, ms);
  };

  return [
    { id: 'root', label: 'Query execution', durationMs: total, indent: 0 },
    optionalChild('settings', 'Settings load', timings?.settings_load_ms),
    optionalChild('kb_ready', 'Knowledge-base ready', timings?.kb_ready_ms),
    optionalChild('contextualize', 'Query contextualize', timings?.contextualize_ms),
    childSpan('retrieval', 'Retrieval', timings?.retrieval_ms),
    childSpan('rerank', 'Reranking', timings?.reranking_ms),
    childSpan('llm', 'LLM generation', timings?.llm_generation_ms),
    childSpan('stream', 'Streaming', timings?.streaming_ms),
    optionalChild('sources', 'Source building', timings?.source_build_ms),
    optionalChild('finalize', 'Answer finalize', timings?.finalize_ms),
  ].filter((span): span is ChatQueryTimingSpan => span != null);
}

function buildTimingSpansFallback(totalMs: number): ChatQueryTimingSpan[] {
  return buildTimingSpansFromSnapshot({
    schema_version: 2,
    status: 'success',
    session_id: '',
    assistant_message_id: '',
    runtime_params: {
      temperature: null,
      top_k: 5,
      similarity_threshold: 0.5,
      max_tokens: 800,
      use_reranker: false,
      reranker_model_name: null,
      embedding_provider: null,
      embedding_model: null,
      llm_provider: null,
      llm_model: null,
      hybrid_search: false,
      vector_store: 'chroma',
      collection_name: null,
      chatbot_language: null,
    },
    retrieval_meta: {},
    token_usage: { prompt_tokens: null, completion_tokens: null, total_tokens: null },
    timings_ms: {
      total_ms: totalMs,
      retrieval_ms: null,
      reranking_ms: null,
      llm_generation_ms: null,
      streaming_ms: null,
      contextualize_ms: null,
      source_build_ms: null,
      finalize_ms: null,
      settings_load_ms: null,
      kb_ready_ms: null,
    },
    confidence_score: null,
    sources_trace: [],
    quality: {},
  });
}

export function mapRowToQueryDetail(row: ChatHistoryApiRow): ChatQueryDetail {
  const base = mapRowToQueryListItem(row);
  const snapshot = row.execution_snapshot ?? null;
  const sources = row.sources ?? [];
  const tokenUsage = snapshot?.token_usage;

  return {
    ...base,
    assistantAnswer: row.assistant_response.trim(),
    sources,
    sourcesTrace: snapshot?.sources_trace ?? [],
    parameters: runtimeParamsToRecord(snapshot?.runtime_params),
    retrievalMetadata: snapshot?.retrieval_meta ?? {},
    timingSpans: snapshot
      ? buildTimingSpansFromSnapshot(snapshot)
      : buildTimingSpansFallback(row.history_total_ms ?? 0),
    tokenUsage: tokenUsage
      ? {
          promptTokens: tokenUsage.prompt_tokens,
          completionTokens: tokenUsage.completion_tokens,
          totalTokens: tokenUsage.total_tokens,
        }
      : null,
    language: snapshot?.runtime_params?.chatbot_language ?? null,
    executionStatus: snapshot?.status ?? row.history_status ?? null,
  };
}

export function filterRowsBySearch(rows: ChatHistoryApiRow[], query: string): ChatHistoryApiRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => {
    const haystack = [
      row.user_message,
      row.assistant_response,
      row.session_id,
      row.message_id,
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

export function sortRowsNewestFirst(rows: ChatHistoryApiRow[]): ChatHistoryApiRow[] {
  return [...rows].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}
