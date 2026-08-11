import type {
  FeedbackListItem,
  FeedbackNegativeReason,
} from '@/features/feedback-moderation/types/feedback-moderation.types';
import { formatNegativeReasonPill } from '@/features/feedback-moderation/utils/feedback-reason-labels';

export function deriveTopNegativeReasonsFromItems(items: FeedbackListItem[]): FeedbackNegativeReason[] {
  const counts = new Map<string, number>();

  for (const item of items) {
    if (item.vote !== 'negative') continue;
    for (const tag of item.contextTags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([key, count]) => ({
      key,
      count,
      label: formatNegativeReasonPill(key, count),
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function resolveTopNegativeReasons(
  summaryReasons: FeedbackNegativeReason[] | undefined,
  items: FeedbackListItem[],
): FeedbackNegativeReason[] {
  if (summaryReasons && summaryReasons.length > 0) return summaryReasons;
  return deriveTopNegativeReasonsFromItems(items);
}
