import { parseFeedbackEntriesPageResponse } from '@/features/feedback-moderation/utils/feedback-api';
import { mapFeedbackListItem } from '@/features/feedback-moderation/utils/feedback-mapper';
import {
  FEEDBACK_TRAINING_STATUS_KEYS,
  FEEDBACK_TRAINING_STATUS_TONES,
  feedbackTrainingStatus,
  mapFeedbackTraining,
  parseFeedbackTrainingPayload,
} from '@/features/feedback-moderation/utils/feedback-training';

const trainedPayload = {
  eligible: true,
  active: true,
  reward: -1,
  guidance: 'Cite the policy page.',
  trained_at: '2026-10-12T10:00:00Z',
  trained_by_user_id: 7,
};

describe('parseFeedbackTrainingPayload', () => {
  it('accepts the bare state and the data envelope', () => {
    expect(parseFeedbackTrainingPayload(trainedPayload)).toEqual(trainedPayload);
    expect(parseFeedbackTrainingPayload({ data: trainedPayload })).toEqual(trainedPayload);
  });

  it('rejects unusable responses', () => {
    expect(parseFeedbackTrainingPayload(null)).toBeNull();
    expect(parseFeedbackTrainingPayload([])).toBeNull();
    expect(parseFeedbackTrainingPayload({ active: true })).toBeNull();
    expect(parseFeedbackTrainingPayload({ message: 'error', success: false })).toBeNull();
  });

  it('defaults missing optional fields', () => {
    expect(parseFeedbackTrainingPayload({ eligible: false })).toEqual({
      eligible: false,
      active: false,
      reward: null,
      guidance: null,
      trained_at: null,
      trained_by_user_id: null,
    });
  });
});

describe('mapFeedbackTraining and feedbackTrainingStatus', () => {
  it('maps an active negative example', () => {
    const state = mapFeedbackTraining(trainedPayload);
    expect(state).toEqual({
      eligible: true,
      active: true,
      reward: -1,
      guidance: 'Cite the policy page.',
      trainedAt: '2026-10-12T10:00:00Z',
    });
    expect(feedbackTrainingStatus(state)).toBe('trained_negative');
  });

  it('keeps guidance but drops reward and date once untrained', () => {
    const state = mapFeedbackTraining({ ...trainedPayload, active: false, reward: 1 });
    expect(state.reward).toBeNull();
    expect(state.trainedAt).toBeNull();
    expect(state.guidance).toBe('Cite the policy page.');
    expect(feedbackTrainingStatus(state)).toBe('not_trained');
  });

  it('reports a positive example', () => {
    expect(feedbackTrainingStatus(mapFeedbackTraining({ ...trainedPayload, reward: 1 }))).toBe('trained_positive');
  });

  it('gives every status a label and a distinct chip tone', () => {
    const statuses = ['not_trained', 'trained_positive', 'trained_negative'] as const;
    for (const status of statuses) {
      expect(FEEDBACK_TRAINING_STATUS_KEYS[status]).toMatch(/^feedbackModeration\.training\.status\./);
    }
    expect(FEEDBACK_TRAINING_STATUS_TONES).toEqual({
      not_trained: 'muted',
      trained_positive: 'success',
      trained_negative: 'warning',
    });
  });
});

describe('list rows', () => {
  const row = {
    id: '1',
    message_id: 'm1',
    user_message: 'hello',
    assistant_preview: 'world',
    feedback: true,
    created_at: '2026-01-01T00:00:00.000Z',
  };

  it('marks trained rows and leaves older rows untouched', () => {
    const page = parseFeedbackEntriesPageResponse({
      items: [{ ...row, training: trainedPayload }, { ...row, id: '2', message_id: 'm2' }],
      total: 2,
    });
    expect(page).not.toBeNull();
    const [trained, legacy] = (page?.items ?? []).map(mapFeedbackListItem);
    expect(trained.trained).toBe(true);
    expect(legacy.trained).toBe(false);
  });
});
