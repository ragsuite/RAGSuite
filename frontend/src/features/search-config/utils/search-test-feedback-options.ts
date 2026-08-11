export const SEARCH_TEST_MIN_QUERY_LENGTH = 3;
export const SEARCH_TEST_MAX_FEEDBACK_COMMENT = 2000;

export const SEARCH_TEST_POSITIVE_REASONS = [
  'helpful',
  'accurate',
  'complete',
  'clear',
  'fast response',
] as const;

export const SEARCH_TEST_NEGATIVE_REASONS = [
  'incorrect',
  'hallucinated',
  'missing sources',
  'too technical',
  'outdated information',
  'low quality',
  'poor formatting',
  'slow response',
] as const;

export type SearchTestFeedbackSentiment = 'positive' | 'negative';

export type SearchTestFeedbackPayload = {
  sentiment: SearchTestFeedbackSentiment;
  rating: number;
  reasons: string[];
  comments: string;
  resultId: string;
};
