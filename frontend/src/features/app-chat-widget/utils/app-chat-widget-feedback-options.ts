import {
  FEEDBACK_REASON_LABELS,
  FEEDBACK_REASON_NEGATIVE_KEYS,
  FEEDBACK_REASON_POSITIVE_KEYS,
  type FeedbackReasonKey,
} from '@/shared/constants/feedback-reason-keys';

export const APP_CHAT_WIDGET_MAX_FEEDBACK_COMMENT = 2000;

export const APP_CHAT_WIDGET_POSITIVE_REASONS = [...FEEDBACK_REASON_POSITIVE_KEYS] as FeedbackReasonKey[];
export const APP_CHAT_WIDGET_NEGATIVE_REASONS = [...FEEDBACK_REASON_NEGATIVE_KEYS] as FeedbackReasonKey[];

export type AppChatWidgetFeedbackSentiment = 'positive' | 'negative';

export type AppChatWidgetFeedbackPayload = {
  messageId: string;
  sessionId?: string;
  sentiment: AppChatWidgetFeedbackSentiment;
  rating: number;
  reasons: FeedbackReasonKey[];
  comments: string;
};

export type AppChatWidgetFeedbackDraft = {
  messageId: string;
  sentiment: AppChatWidgetFeedbackSentiment;
};

export function feedbackReasonLabel(key: FeedbackReasonKey): string {
  return FEEDBACK_REASON_LABELS[key];
}
