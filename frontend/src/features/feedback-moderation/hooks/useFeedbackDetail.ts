import { useCallback, useEffect, useState } from 'react';

import { useAuthenticatedBootstrap } from '@/features/auth/hooks/use-authenticated-bootstrap';
import { useActiveProject } from '@/features/projects/providers/active-project-provider';
import { fetchFeedbackById } from '@/features/feedback-moderation/services/feedback-moderation.service';
import type { FeedbackDetail } from '@/features/feedback-moderation/types/feedback-moderation.types';
import { getCachedFeedbackListItem } from '@/features/feedback-moderation/utils/feedback-cache';

const DEFAULT_ERROR = 'Unable to load feedback details. Please try again.';

export function useFeedbackDetail(feedbackId?: string) {
  const { isReady } = useAuthenticatedBootstrap();
  const { activeProjectId } = useActiveProject();
  const [detail, setDetail] = useState<FeedbackDetail | null>(null);
  const [loading, setLoading] = useState(Boolean(feedbackId));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!feedbackId) {
      setDetail(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const cached = getCachedFeedbackListItem(feedbackId);
      const response = await fetchFeedbackById(
        feedbackId,
        activeProjectId,
        cached?.messageType,
      );
      if (!response) {
        setError('Feedback entry not found.');
        setDetail(null);
      } else {
        setDetail(response);
      }
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : DEFAULT_ERROR;
      setError(message);
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [activeProjectId, feedbackId]);

  useEffect(() => {
    if (!isReady) return;
    void load();
  }, [isReady, load]);

  const preview = feedbackId ? getCachedFeedbackListItem(feedbackId) : undefined;

  return {
    detail,
    preview,
    loading,
    error,
    reload: load,
    setDetail,
  };
}
