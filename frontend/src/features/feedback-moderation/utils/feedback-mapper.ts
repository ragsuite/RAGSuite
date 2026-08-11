import type {
  FeedbackDetail,
  FeedbackDetailPayload,
  FeedbackListItem,
  FeedbackListItemPayload,
  FeedbackMessageType,
  FeedbackSummary,
  FeedbackSummaryPayload,
} from '@/features/feedback-moderation/types/feedback-moderation.types';

function resolveMessageType(value: string): FeedbackMessageType {
  return value === 'search' ? 'search' : 'chat';
}
import {
  confidenceLabelFromScore,
  voteFromFeedback,
} from '@/features/feedback-moderation/utils/feedback-display';

import {
  formatNegativeReasonPill,
} from '@/features/feedback-moderation/utils/feedback-reason-labels';

export function mapFeedbackSummary(payload: FeedbackSummaryPayload): FeedbackSummary {
  return {
    totalCount: payload.total_count,
    positiveCount: payload.positive_count,
    negativeCount: payload.negative_count,
    positivePct: payload.positive_pct,
    negativePct: payload.negative_pct,
    avgTotalMs: payload.avg_total_ms,
    topNegativeReasons: payload.top_negative_reasons.map((reason) => ({
      key: reason.key,
      count: reason.count,
      label: formatNegativeReasonPill(reason.key, reason.count),
    })),
    flaggedCount: payload.flagged_count,
    reviewedCount: payload.reviewed_count,
  };
}

export function mapFeedbackListItem(row: FeedbackListItemPayload): FeedbackListItem {
  const moderation = row.feedback_moderation;
  return {
    id: row.id,
    messageId: row.message_id,
    sessionId: row.session_id,
    messageType: resolveMessageType(row.message_type),
    userMessage: row.user_message,
    assistantPreview: row.assistant_preview,
    vote: voteFromFeedback(row.feedback, row.feedback_rating),
    feedbackRating: row.feedback_rating,
    createdAt: row.created_at,
    totalMs: row.total_ms,
    confidenceScore: row.confidence_score,
    confidenceLabel: confidenceLabelFromScore(row.confidence_score),
    llmModel: row.llm_model,
    reviewed: moderation?.reviewed ?? false,
    flagged: moderation?.flagged ?? false,
    contextTags: row.context_tags ?? [],
  };
}

export function mapFeedbackDetail(row: FeedbackDetailPayload): FeedbackDetail {
  const base = mapFeedbackListItem(row);
  return {
    ...base,
    assistantResponse: row.assistant_response,
    sources: row.sources ?? [],
    feedbackText: row.feedback_text,
    contextTags: row.context_tags ?? [],
    embeddingModel: row.embedding_model,
    moderation: row.feedback_moderation,
    executionSnapshot: row.execution_snapshot ?? null,
  };
}
