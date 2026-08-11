import type { PredefinedQuestionsSettings } from '@/features/search-config/types/search-config.types';

export const DEFAULT_PREDEFINED_QUESTIONS_SETTINGS: PredefinedQuestionsSettings = {
  enabled: false,
  questionLimit: 5,
  questionsPosition: 'below-search',
  questions: [],
};

export function clampQuestionLimit(value: number): number {
  if (!Number.isFinite(value)) return 5;
  return Math.max(1, Math.min(50, Math.round(value)));
}

export function previewPredefinedQuestions(settings: PredefinedQuestionsSettings) {
  const limit = clampQuestionLimit(settings.questionLimit);
  return settings.questions.filter((q) => q.text.trim()).slice(0, limit);
}
