export type FeedbackVoteFilter = 'all' | 'positive' | 'negative';

export type FeedbackModerationRecord = {
  internal_notes: string | null;
  reviewed: boolean;
  flagged: boolean;
  flag_reason?: string | null;
  updated_at?: string;
};

export type FeedbackNegativeReasonStat = {
  key: string;
  count: number;
};

export type FeedbackSummaryPayload = {
  total_count: number;
  positive_count: number;
  negative_count: number;
  positive_pct: number;
  negative_pct: number;
  avg_total_ms: number;
  top_negative_reasons: FeedbackNegativeReasonStat[];
  low_confidence_negative_count: number;
  flagged_count: number;
  reviewed_count: number;
};

export type FeedbackListItemPayload = {
  id: string;
  message_id: string;
  session_id: string;
  user_id: number;
  user_message: string;
  assistant_preview: string;
  assistant_response_length: number;
  feedback: boolean;
  feedback_rating: number;
  feedback_text: string | null;
  context_tags: string[] | null;
  message_type: string;
  created_at: string;
  confidence_score: number | null;
  total_ms: number | null;
  llm_model: string | null;
  embedding_model: string | null;
  feedback_moderation: FeedbackModerationRecord | null;
};

export type FeedbackSourcePayload = {
  title: string;
  url: string;
};

export type FeedbackDetailPayload = FeedbackListItemPayload & {
  assistant_response: string;
  sources: FeedbackSourcePayload[] | null;
  execution_snapshot?: Record<string, unknown> | null;
};

export type FeedbackNegativeReason = {
  key: string;
  count: number;
  label: string;
};

export type FeedbackSummary = {
  totalCount: number;
  positiveCount: number;
  negativeCount: number;
  positivePct: number;
  negativePct: number;
  avgTotalMs: number;
  topNegativeReasons: FeedbackNegativeReason[];
  flaggedCount: number;
  reviewedCount: number;
};

export type FeedbackVoteTone = 'positive' | 'negative';

export type FeedbackMessageType = 'chat' | 'search';

export type FeedbackListItem = {
  id: string;
  messageId: string;
  sessionId: string;
  messageType: FeedbackMessageType;
  userMessage: string;
  assistantPreview: string;
  vote: FeedbackVoteTone;
  feedbackRating: number;
  createdAt: string;
  totalMs: number | null;
  confidenceScore: number | null;
  confidenceLabel: string | null;
  llmModel: string | null;
  reviewed: boolean;
  flagged: boolean;
  contextTags: string[];
};

export type FeedbackDetail = FeedbackListItem & {
  assistantResponse: string;
  sources: FeedbackSourcePayload[];
  feedbackText: string | null;
  contextTags: string[] | null;
  embeddingModel: string | null;
  moderation: FeedbackModerationRecord | null;
  executionSnapshot: Record<string, unknown> | null;
};

export type SaveModerationInput = {
  internalNotes: string;
  reviewed: boolean;
  flagged: boolean;
  flagReason?: string;
};
