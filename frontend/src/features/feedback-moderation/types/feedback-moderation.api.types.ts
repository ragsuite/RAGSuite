import type { FeedbackVoteFilter } from '@/features/feedback-moderation/types/feedback-moderation.types';

export type FeedbackModerationMessageType = 'all' | 'chat' | 'search';

export type FeedbackModerationListParams = {
  limit: number;
  offset: number;
  messageType?: FeedbackModerationMessageType;
  q?: string;
  voteFilter?: FeedbackVoteFilter;
  sessionId?: string;
  userId?: number;
  reason?: string;
  dateFrom?: string;
  dateTo?: string;
  reviewed?: boolean;
  flagged?: boolean;
  minConfidence?: number;
  maxConfidence?: number;
  minTotalMs?: number;
  maxTotalMs?: number;
  llmModel?: string;
  sourceContains?: string;
};

export type FeedbackModerationExportParams = {
  fmt: 'csv' | 'json';
  messageType?: FeedbackModerationMessageType;
  maxRows?: number;
  q?: string;
  voteFilter?: FeedbackVoteFilter;
  sessionId?: string;
  userId?: number;
  reason?: string;
  dateFrom?: string;
  dateTo?: string;
  reviewed?: boolean;
  flagged?: boolean;
  minConfidence?: number;
  maxConfidence?: number;
  minTotalMs?: number;
  maxTotalMs?: number;
  llmModel?: string;
  sourceContains?: string;
};

export type FeedbackModerationPatchBody = {
  internal_notes?: string | null;
  reviewed?: boolean;
  flagged?: boolean;
  flag_reason?: string | null;
};
