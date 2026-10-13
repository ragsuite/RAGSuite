import { useCallback, useEffect, useRef, useState } from 'react';

import {
  fetchFeedbackTraining,
  trainFeedback,
  untrainFeedback,
} from '@/features/feedback-moderation/services/feedback-moderation.service';
import type { FeedbackTrainingState } from '@/features/feedback-moderation/types/feedback-moderation.types';

type TrainingAction = 'train' | 'untrain' | null;

export function useFeedbackTraining(messageId: string) {
  const [state, setState] = useState<FeedbackTrainingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [pending, setPending] = useState<TrainingAction>(null);
  const currentId = useRef(messageId);

  const load = useCallback(async () => {
    currentId.current = messageId;
    setLoading(true);
    setLoadFailed(false);
    try {
      const next = await fetchFeedbackTraining(messageId);
      if (currentId.current === messageId) setState(next);
    } catch {
      if (currentId.current === messageId) {
        setState(null);
        setLoadFailed(true);
      }
    } finally {
      if (currentId.current === messageId) setLoading(false);
    }
  }, [messageId]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = useCallback(
    async (action: Exclude<TrainingAction, null>, guidance = ''): Promise<boolean> => {
      setPending(action);
      try {
        const next = action === 'train' ? await trainFeedback(messageId, guidance) : await untrainFeedback(messageId);
        if (currentId.current === messageId) setState(next);
        return true;
      } catch {
        return false;
      } finally {
        setPending(null);
      }
    },
    [messageId],
  );

  return {
    state,
    loading,
    loadFailed,
    pending,
    reload: load,
    train: (guidance: string) => run('train', guidance),
    untrain: () => run('untrain'),
  };
}
