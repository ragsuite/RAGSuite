import type { FaqQuestion, FaqSettings } from '@/features/chatbot-config/types/chatbot-config.types';
import { isFaqItemAnswerMissing } from '@/shared/components/faq-editor/faq-editor.utils';

export const FAQ_QUESTION_LIMIT_MIN = 1;
export const FAQ_QUESTION_LIMIT_MAX = 5;
export const FAQ_QUESTION_LIMIT_DEFAULT = 3;
export const FAQ_QUESTION_MAX_LENGTH = 500;
export const FAQ_ANSWER_MAX_LENGTH = 4000;

export const DEFAULT_FAQ_SETTINGS: FaqSettings = {
  enabled: false,
  questionLimit: FAQ_QUESTION_LIMIT_DEFAULT,
  questions: [],
};

export function clampFaqQuestionLimit(value: number): number {
  if (!Number.isFinite(value)) return FAQ_QUESTION_LIMIT_DEFAULT;
  return Math.max(FAQ_QUESTION_LIMIT_MIN, Math.min(FAQ_QUESTION_LIMIT_MAX, Math.round(value)));
}

export function visibleFaqQuestions(settings: FaqSettings) {
  const limit = clampFaqQuestionLimit(settings.questionLimit);
  return settings.questions.filter((q) => q.text.trim()).slice(0, limit);
}

export const isFaqAnswerMissing = isFaqItemAnswerMissing;

/** Questions that would be saved (within limit) but still have no configured answer. */
export function faqQuestionsMissingAnswers(settings: FaqSettings): FaqQuestion[] {
  return visibleFaqQuestions(settings).filter(isFaqItemAnswerMissing);
}
