/** Source reference on list/detail payloads */
export type ChatHistorySourceRef = {
  title: string;
  url: string;
};

export type ChatHistoryRuntimeParams = {
  temperature: number | null;
  top_k: number;
  similarity_threshold: number;
  max_tokens: number;
  use_reranker: boolean;
  reranker_model_name: string | null;
  embedding_provider: string | null;
  embedding_model: string | null;
  llm_provider: string | null;
  llm_model: string | null;
  hybrid_search: boolean;
  vector_store: string;
  collection_name: string | null;
  chatbot_language: string | null;
};

export type ChatHistoryTimingsMs = {
  total_ms: number;
  retrieval_ms: number | null;
  reranking_ms: number | null;
  llm_generation_ms: number | null;
  streaming_ms: number | null;
  contextualize_ms?: number | null;
  source_build_ms?: number | null;
  finalize_ms?: number | null;
  settings_load_ms?: number | null;
  kb_ready_ms?: number | null;
};

export type ChatHistoryTokenUsage = {
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
};

export type ChatHistorySourceTrace = {
  index: number;
  document_id: string;
  title: string;
  url: string;
  source_file: string;
  source_type: string;
  chunk_id: string | null;
  similarity_pct: number;
  page_number: number | null;
  metadata: Record<string, unknown>;
  text_preview: string;
  reranked: boolean;
};

export type ChatHistoryExecutionSnapshot = {
  schema_version: number;
  status: string;
  session_id: string;
  assistant_message_id: string;
  runtime_params: ChatHistoryRuntimeParams;
  retrieval_meta: Record<string, unknown>;
  token_usage: ChatHistoryTokenUsage;
  timings_ms: ChatHistoryTimingsMs;
  confidence_score: number | null;
  sources_trace: ChatHistorySourceTrace[];
  quality: Record<string, unknown>;
};

/** Raw row from GET /api/v1/chat/history (list) or GET /api/v1/chat/messages/:id (detail) */
export type ChatHistoryApiRow = {
  id: string;
  session_id: string;
  message_id: string;
  user_message: string;
  assistant_response: string;
  message_type: string;
  sources: ChatHistorySourceRef[] | null;
  feedback: string | null;
  feedback_rating: number | null;
  feedback_text: string | null;
  context_tags: string[] | null;
  created_at: string;
  history_status: string;
  history_confidence: number | null;
  history_total_ms: number;
  execution_snapshot?: ChatHistoryExecutionSnapshot | null;
  feedback_moderation?: unknown | null;
};

export type ChatQueryTagTone = 'greeting' | 'high' | 'medium' | 'low' | 'failed';

export type ChatQueryListItem = {
  id: string;
  sessionId: string;
  messageId: string;
  question: string;
  answerPreview: string;
  createdAt: string;
  latencyMs: number;
  status: 'success' | 'failed';
  confidence: number | null;
  tagLabel: string;
  tagTone: ChatQueryTagTone;
};

export type ChatQueryTimingSpan = {
  id: string;
  label: string;
  durationMs: number | null;
  unavailable?: boolean;
  indent?: number;
};

export type ChatQueryTokenUsage = {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
};

export type ChatQueryDetail = ChatQueryListItem & {
  assistantAnswer: string;
  sources: ChatHistorySourceRef[];
  sourcesTrace: ChatHistorySourceTrace[];
  parameters: Record<string, string | number | boolean>;
  retrievalMetadata: Record<string, unknown>;
  timingSpans: ChatQueryTimingSpan[];
  tokenUsage: ChatQueryTokenUsage | null;
  language: string | null;
  executionStatus: string | null;
};

export type ChatHistoryListResponse = {
  items: ChatQueryListItem[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

export type ChatHistoryQueryParams = {
  limit: number;
  offset: number;
  q?: string;
  sessionId?: string;
  projectId?: string;
  paginated?: boolean;
};

export type ChatHistoryExportParams = {
  fmt: 'csv' | 'json';
  q?: string;
  sessionId?: string;
  projectId?: string;
  maxRows?: number;
};
