import type {
  PredefinedQuestion,
  PredefinedQuestionsSettings,
} from '@/features/search-config/types/search-config.types';
import { SEARCH_TEST_MAX_QUERY_LENGTH } from '@/features/search-config/utils/search-test-options';
import { isFaqItemAnswerMissing } from '@/shared/components/faq-editor/faq-editor.utils';

export const SEARCH_FAQ_LIMIT_MIN = 1;
export const SEARCH_FAQ_LIMIT_MAX = 50;
export const SEARCH_FAQ_LIMIT_DEFAULT = 5;
/** A clicked card fills the search box, so questions share the query length cap. */
export const SEARCH_FAQ_QUESTION_MAX_LENGTH = SEARCH_TEST_MAX_QUERY_LENGTH;
export const SEARCH_FAQ_ANSWER_MAX_LENGTH = 4000;

export const DEFAULT_PREDEFINED_QUESTIONS_SETTINGS: PredefinedQuestionsSettings = {
  enabled: false,
  questionLimit: SEARCH_FAQ_LIMIT_DEFAULT,
  questionsPosition: 'below-search',
  questions: [],
};

export function clampQuestionLimit(value: number): number {
  if (!Number.isFinite(value)) return SEARCH_FAQ_LIMIT_DEFAULT;
  return Math.max(SEARCH_FAQ_LIMIT_MIN, Math.min(SEARCH_FAQ_LIMIT_MAX, Math.round(value)));
}

export function previewPredefinedQuestions(settings: PredefinedQuestionsSettings) {
  const limit = clampQuestionLimit(settings.questionLimit);
  return settings.questions.filter((q) => q.text.trim()).slice(0, limit);
}

/** FAQ cards for Search Test and the embed widget (enabled, ordered, within the limit). */
export function searchFaqCardQuestions(
  settings: PredefinedQuestionsSettings | null | undefined,
): PredefinedQuestion[] {
  if (!settings?.enabled) return [];
  const ordered = settings.questions.slice().sort((a, b) => a.order - b.order);
  return previewPredefinedQuestions({ ...settings, questions: ordered });
}

/** Questions still lacking an answer; the API mapper skips saving questions while any exist. */
export function searchFaqQuestionsMissingAnswers(settings: PredefinedQuestionsSettings): PredefinedQuestion[] {
  return settings.questions.filter(isFaqItemAnswerMissing);
}
