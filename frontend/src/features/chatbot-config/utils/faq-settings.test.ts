import {
  clampFaqQuestionLimit,
  DEFAULT_FAQ_SETTINGS,
  FAQ_QUESTION_LIMIT_DEFAULT,
  visibleFaqQuestions,
} from '@/features/chatbot-config/utils/faq-settings';
import type { FaqSettings } from '@/features/chatbot-config/types/chatbot-config.types';

describe('faq-settings utils', () => {
  it('clamps question limit to 1–5 with default 3', () => {
    expect(clampFaqQuestionLimit(Number.NaN)).toBe(FAQ_QUESTION_LIMIT_DEFAULT);
    expect(clampFaqQuestionLimit(0)).toBe(1);
    expect(clampFaqQuestionLimit(3)).toBe(3);
    expect(clampFaqQuestionLimit(5)).toBe(5);
    expect(clampFaqQuestionLimit(99)).toBe(5);
  });

  it('slices visible questions by limit', () => {
    const settings: FaqSettings = {
      ...DEFAULT_FAQ_SETTINGS,
      questionLimit: 2,
      questions: [
        { id: '1', text: 'One', order: 1 },
        { id: '2', text: '  ', order: 2 },
        { id: '3', text: 'Three', order: 3 },
        { id: '4', text: 'Four', order: 4 },
      ],
    };
    expect(visibleFaqQuestions(settings).map((q) => q.text)).toEqual(['One', 'Three']);
  });
});
