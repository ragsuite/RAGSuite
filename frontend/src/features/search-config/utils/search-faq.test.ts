import type {
  PredefinedQuestionsSettings,
  SearchBoxCustomization,
} from '@/features/search-config/types/search-config.types';
import {
  DEFAULT_PREDEFINED_QUESTIONS_SETTINGS,
  searchFaqCardQuestions,
  searchFaqQuestionsMissingAnswers,
} from '@/features/search-config/utils/predefined-questions';
import {
  mapSearchCustomizationApi,
  mapSearchCustomizationToApiUpdate,
} from '@/features/search-config/utils/search-api-mappers';
import {
  isSearchFaqHistoryEntry,
  shouldShowSearchFaqCards,
} from '@/features/search-config/utils/search-faq-cards';
import { buildSearchStreamRequestBody } from '@/features/search-config/utils/search-stream';

const DEFAULT_SEARCH_WIDGET_CUSTOMIZATION: SearchBoxCustomization = {
  searchFormType: 'with-button',
  buttonType: 'with-label',
  searchButtonText: 'Search',
  searchInputPlaceholder: 'Search using AI...',
  recentSearchEnabled: true,
  recentSearchTitle: 'Recent Searches',
  recentSearchLimit: 5,
  showSpeechInput: true,
  showSpeechOutput: true,
  showDisclaimer: true,
  disclaimerText: '',
  showDisclaimerLink: true,
  disclaimerLinkLabel: '',
  disclaimerLinkUrl: '',
};

const settings = (overrides: Partial<PredefinedQuestionsSettings> = {}): PredefinedQuestionsSettings => ({
  ...DEFAULT_PREDEFINED_QUESTIONS_SETTINGS,
  enabled: true,
  questionLimit: 2,
  questions: [
    { id: 'pq_2', text: 'Second', order: 2, answer: 'B' },
    { id: 'pq_1', text: 'First', order: 1, answer: 'A' },
    { id: 'pq_3', text: 'Third', order: 3, answer: 'C' },
  ],
  ...overrides,
});

describe('search FAQ mappers', () => {
  it('reads ids and answers, assigning pq_n ids to legacy rows', () => {
    const mapped = mapSearchCustomizationApi(
      { questions: ['Legacy', { id: 'x', question: 'With answer', answer: 'Yes', order: 1 }] },
      DEFAULT_SEARCH_WIDGET_CUSTOMIZATION,
      DEFAULT_PREDEFINED_QUESTIONS_SETTINGS,
    );
    expect(mapped?.predefined.questions).toEqual([
      { id: 'pq_1', text: 'Legacy', order: 1, answer: '' },
      { id: 'x', text: 'With answer', order: 1, answer: 'Yes' },
    ]);
  });

  it('sends id, question, answer and order for fully answered FAQs', () => {
    const body = mapSearchCustomizationToApiUpdate(DEFAULT_SEARCH_WIDGET_CUSTOMIZATION, settings());
    expect(body.questions).toEqual([
      { id: 'pq_2', question: 'Second', answer: 'B', order: 0 },
      { id: 'pq_1', question: 'First', answer: 'A', order: 1 },
      { id: 'pq_3', question: 'Third', answer: 'C', order: 2 },
    ]);
    expect(body.predefinedQuestions).toBe(true);
    expect(body.questionsLimit).toBe(2);
  });

  it('omits questions while any answer is missing so legacy rows are not overwritten', () => {
    const partial = settings({
      questions: [
        { id: 'pq_1', text: 'First', order: 1, answer: 'A' },
        { id: 'pq_2', text: 'Legacy', order: 2, answer: '  ' },
      ],
    });
    const body = mapSearchCustomizationToApiUpdate(DEFAULT_SEARCH_WIDGET_CUSTOMIZATION, partial);
    expect(body.questions).toBeUndefined();
    expect(body.predefinedQuestions).toBe(true);
    expect(searchFaqQuestionsMissingAnswers(partial).map((q) => q.id)).toEqual(['pq_2']);
  });
});

describe('search FAQ cards', () => {
  it('lists enabled cards in order within the limit', () => {
    expect(searchFaqCardQuestions(settings()).map((q) => q.id)).toEqual(['pq_1', 'pq_2']);
    expect(searchFaqCardQuestions(settings({ enabled: false }))).toEqual([]);
    expect(searchFaqCardQuestions(null)).toEqual([]);
  });

  const base = { cardCount: 2, showRecent: false, loading: false, query: '', hasAnswer: false };

  it('shows cards before a search', () => {
    expect(shouldShowSearchFaqCards(base)).toBe(true);
    expect(shouldShowSearchFaqCards({ ...base, query: 'typing' })).toBe(true);
  });

  it('hides cards while recents are open, loading, or an answer is shown', () => {
    expect(shouldShowSearchFaqCards({ ...base, cardCount: 0 })).toBe(false);
    expect(shouldShowSearchFaqCards({ ...base, showRecent: true })).toBe(false);
    expect(shouldShowSearchFaqCards({ ...base, loading: true })).toBe(false);
    expect(shouldShowSearchFaqCards({ ...base, query: 'First', hasAnswer: true })).toBe(false);
  });

  it('brings cards back once the query is cleared', () => {
    expect(shouldShowSearchFaqCards({ ...base, query: '   ', hasAnswer: true })).toBe(true);
  });

  it('keeps FAQ answers out of Recent Searches', () => {
    expect(isSearchFaqHistoryEntry({ answer_source: 'faq' })).toBe(true);
    expect(isSearchFaqHistoryEntry({ answer_source: null })).toBe(false);
    expect(isSearchFaqHistoryEntry({})).toBe(false);
  });
});

describe('search stream body faq_id', () => {
  const input = { query: 'First', topK: 5, similarityThreshold: 0.2, useReranker: false };

  it('omits faq_id for typed searches', () => {
    expect(buildSearchStreamRequestBody(input).faq_id).toBeUndefined();
  });

  it('includes faq_id for card clicks', () => {
    expect(buildSearchStreamRequestBody({ ...input, faqId: 'pq_1' }).faq_id).toBe('pq_1');
  });
});
