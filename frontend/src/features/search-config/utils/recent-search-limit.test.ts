import {
  clampRecentSearchLimit,
  limitRecentSearches,
  RECENT_SEARCH_LIMIT_DEFAULT,
  RECENT_SEARCH_LIMIT_MAX,
} from '@/features/search-config/utils/recent-search-limit';
import { mapSearchCustomizationApi, mapSearchCustomizationToApiUpdate } from '@/features/search-config/utils/search-api-mappers';
import type {
  PredefinedQuestionsSettings,
  SearchBoxCustomization,
} from '@/features/search-config/types/search-config.types';

const customization: SearchBoxCustomization = {
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

const predefined: PredefinedQuestionsSettings = {
  enabled: false,
  questionLimit: 5,
  questionsPosition: 'below-search',
  questions: [],
};

describe('recent search limit', () => {
  it('clamps to 1-5 and defaults invalid values to 5', () => {
    expect(RECENT_SEARCH_LIMIT_MAX).toBe(5);
    expect(clampRecentSearchLimit(3)).toBe(3);
    expect(clampRecentSearchLimit('2')).toBe(2);
    expect(clampRecentSearchLimit(0)).toBe(1);
    expect(clampRecentSearchLimit(-4)).toBe(1);
    expect(clampRecentSearchLimit(12)).toBe(5);
    expect(clampRecentSearchLimit(2.7)).toBe(2);
    expect(clampRecentSearchLimit(undefined)).toBe(RECENT_SEARCH_LIMIT_DEFAULT);
    expect(clampRecentSearchLimit('abc')).toBe(RECENT_SEARCH_LIMIT_DEFAULT);
    expect(clampRecentSearchLimit(Number.NaN)).toBe(RECENT_SEARCH_LIMIT_DEFAULT);
  });

  it('limits a list without mutating it', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(limitRecentSearches(items, 2)).toEqual(['a', 'b']);
    expect(limitRecentSearches(items, 99)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(limitRecentSearches(['a'], 5)).toEqual(['a']);
    expect(items).toHaveLength(6);
  });

  it('maps recentSearchLimit from and to the API', () => {
    const readLimit = (body: Record<string, unknown>, current = customization) =>
      mapSearchCustomizationApi(body, current, predefined)?.customization.recentSearchLimit;
    expect(readLimit({ recentSearchLimit: 3 })).toBe(3);
    expect(readLimit({ recentSearchLimit: 40 })).toBe(5);
    expect(readLimit({}, { ...customization, recentSearchLimit: 2 })).toBe(2);
    expect(mapSearchCustomizationToApiUpdate({ ...customization, recentSearchLimit: 4 }).recentSearchLimit).toBe(4);
  });

  it('maps disclaimer fields from and to the API', () => {
    const mapped = mapSearchCustomizationApi(
      {
        showDisclaimer: false,
        disclaimerText: 'Custom note',
        showDisclaimerLink: false,
        disclaimerLinkLabel: 'acme.com',
        disclaimerLinkUrl: 'https://acme.com',
      },
      customization,
      predefined,
    )?.customization;
    expect(mapped?.showDisclaimer).toBe(false);
    expect(mapped?.disclaimerText).toBe('Custom note');
    expect(mapped?.showDisclaimerLink).toBe(false);
    expect(mapped?.disclaimerLinkLabel).toBe('acme.com');
    expect(mapped?.disclaimerLinkUrl).toBe('https://acme.com');

    const body = mapSearchCustomizationToApiUpdate({
      ...customization,
      showDisclaimer: false,
      disclaimerText: 'Custom note',
      showDisclaimerLink: false,
      disclaimerLinkLabel: 'acme.com',
      disclaimerLinkUrl: 'https://acme.com',
    });
    expect(body.showDisclaimer).toBe(false);
    expect(body.disclaimerText).toBe('Custom note');
    expect(body.showDisclaimerLink).toBe(false);
    expect(body.disclaimerLinkLabel).toBe('acme.com');
    expect(body.disclaimerLinkUrl).toBe('https://acme.com');
  });
});
