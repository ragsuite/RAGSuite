import type { FaqSettings } from '@/features/chatbot-config/types/chatbot-config.types';

export const FAQ_QUESTION_LIMIT_MIN = 1;
export const FAQ_QUESTION_LIMIT_MAX = 8;
export const FAQ_QUESTION_LIMIT_DEFAULT = 4;

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
