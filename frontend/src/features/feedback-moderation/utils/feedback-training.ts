import type {
  FeedbackTrainingPayload,
  FeedbackTrainingState,
  FeedbackTrainingStatus,
} from '@/features/feedback-moderation/types/feedback-moderation.types';

export const FEEDBACK_TRAINING_GUIDANCE_MAX = 1000;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Accepts the bare state or an envelope (`{ data: state }`); null when unusable. */
export function parseFeedbackTrainingPayload(raw: unknown): FeedbackTrainingPayload | null {
  const outer = asRecord(raw);
  const record = asRecord(outer?.data) ?? outer;
  if (!record || typeof record.eligible !== 'boolean') return null;
  return {
    eligible: record.eligible,
    active: record.active === true,
    reward: typeof record.reward === 'number' ? record.reward : null,
    guidance: typeof record.guidance === 'string' ? record.guidance : null,
    trained_at: typeof record.trained_at === 'string' ? record.trained_at : null,
    trained_by_user_id: typeof record.trained_by_user_id === 'number' ? record.trained_by_user_id : null,
  };
}

export function mapFeedbackTraining(payload: FeedbackTrainingPayload): FeedbackTrainingState {
  const reward = payload.active && payload.reward != null ? (payload.reward > 0 ? 1 : -1) : null;
  return {
    eligible: payload.eligible,
    active: payload.active,
    reward,
    guidance: payload.guidance ?? '',
    trainedAt: payload.active ? payload.trained_at : null,
  };
}

export function feedbackTrainingStatus(state: FeedbackTrainingState): FeedbackTrainingStatus {
  if (!state.active || state.reward == null) return 'not_trained';
  return state.reward > 0 ? 'trained_positive' : 'trained_negative';
}

export const FEEDBACK_TRAINING_STATUS_KEYS: Record<FeedbackTrainingStatus, string> = {
  not_trained: 'feedbackModeration.training.status.notTrained',
  trained_positive: 'feedbackModeration.training.status.trainedPositive',
  trained_negative: 'feedbackModeration.training.status.trainedNegative',
};
