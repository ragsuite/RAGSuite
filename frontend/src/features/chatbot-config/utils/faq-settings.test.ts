import {
  clampFaqQuestionLimit,
  DEFAULT_FAQ_SETTINGS,
  FAQ_QUESTION_LIMIT_DEFAULT,
  faqQuestionsMissingAnswers,
  isFaqAnswerMissing,
  visibleFaqQuestions,
} from '@/features/chatbot-config/utils/faq-settings';
import {
  mapFaqSettingsFromApi,
  mapFaqSettingsToApi,
} from '@/features/chatbot-config/utils/chatbot-api-mappers';
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
        { id: '1', text: 'One', order: 1, answer: 'A1' },
        { id: '2', text: '  ', order: 2, answer: '' },
        { id: '3', text: 'Three', order: 3, answer: 'A3' },
        { id: '4', text: 'Four', order: 4, answer: 'A4' },
      ],
    };
    expect(visibleFaqQuestions(settings).map((q) => q.text)).toEqual(['One', 'Three']);
  });

  it('detects questions missing an answer within the limit', () => {
    const settings: FaqSettings = {
      enabled: true,
      questionLimit: 2,
      questions: [
        { id: '1', text: 'One', order: 1, answer: '  ' },
        { id: '2', text: 'Two', order: 2, answer: 'Answer' },
        { id: '3', text: 'Three', order: 3, answer: '' },
      ],
    };
    expect(isFaqAnswerMissing({ answer: ' ' })).toBe(true);
    expect(isFaqAnswerMissing({ answer: 'x' })).toBe(false);
    expect(isFaqAnswerMissing({ answer: '<p><br></p>' })).toBe(true);
    expect(isFaqAnswerMissing({ answer: '<p>&nbsp;</p>' })).toBe(true);
    expect(isFaqAnswerMissing({ answer: '<p><strong>Yes</strong></p>' })).toBe(false);
    expect(faqQuestionsMissingAnswers(settings).map((q) => q.id)).toEqual(['1']);
  });
});

describe('faq api mappers', () => {
  it('maps answers from API and defaults legacy rows to empty', () => {
    const mapped = mapFaqSettingsFromApi({
      enabled: true,
      questionsLimit: 3,
      questions: [
        { id: 'a', text: 'Q1', order: 1, answer: '  A1  ' },
        { id: 'b', text: 'Q2', order: 2 },
        'Q3',
      ],
    });
    expect(mapped.questions.map((q) => q.answer)).toEqual(['A1', '', '']);
  });

  it('sends trimmed answers to the API', () => {
    const body = mapFaqSettingsToApi({
      enabled: true,
      questionLimit: 3,
      questions: [{ id: 'a', text: ' Q1 ', order: 1, answer: ' A1 ' }],
    });
    expect(body.questions).toEqual([{ id: 'a', text: 'Q1', order: 1, answer: 'A1' }]);
  });

  it('omits questions while legacy rows are still unanswered', () => {
    const body = mapFaqSettingsToApi({
      enabled: false,
      questionLimit: 3,
      questions: [
        { id: 'a', text: 'Q1', order: 1, answer: 'A1' },
        { id: 'b', text: 'Q2', order: 2, answer: '' },
      ],
    });
    expect(body).toEqual({ enabled: false, questionsLimit: 3 });
  });
});
