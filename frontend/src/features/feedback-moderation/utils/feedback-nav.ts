import type { Href } from 'expo-router';

export const FEEDBACK_MODERATION_LIST_HREF = '/(app)/feedback-moderation' as Href;

export function feedbackDetailRoute(feedbackId: string): Href {
  return `/(app)/feedback-moderation/${feedbackId}` as Href;
}
