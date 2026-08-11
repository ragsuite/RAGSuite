import type { FeedbackListItem } from '@/features/feedback-moderation/types/feedback-moderation.types';

const listCache = new Map<string, FeedbackListItem>();

export function cacheFeedbackListItem(item: FeedbackListItem) {
  listCache.set(item.id, item);
}

export function getCachedFeedbackListItem(id: string): FeedbackListItem | undefined {
  return listCache.get(id);
}
