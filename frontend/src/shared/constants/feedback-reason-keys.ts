/** Stable keys — must match backend `feedback_reason_catalog.py` */
export const FEEDBACK_REASON_POSITIVE_KEYS = [
  'helpful',
  'accurate',
  'complete',
  'clear',
  'fast_response',
] as const;

export const FEEDBACK_REASON_NEGATIVE_KEYS = [
  'incorrect',
  'hallucinated',
  'missing_sources',
  'too_technical',
  'outdated_information',
  'low_quality',
  'poor_formatting',
  'slow_response',
] as const;

export type FeedbackReasonKey =
  | (typeof FEEDBACK_REASON_POSITIVE_KEYS)[number]
  | (typeof FEEDBACK_REASON_NEGATIVE_KEYS)[number];

export const FEEDBACK_REASON_LABELS: Record<FeedbackReasonKey, string> = {
  helpful: 'Helpful',
  accurate: 'Accurate',
  complete: 'Complete',
  clear: 'Clear',
  fast_response: 'Fast response',
  incorrect: 'Incorrect',
  hallucinated: 'Hallucinated',
  missing_sources: 'Missing sources',
  too_technical: 'Too technical',
  outdated_information: 'Outdated information',
  low_quality: 'Low quality',
  poor_formatting: 'Poor formatting',
  slow_response: 'Slow response',
};
