import { interpolateTranslation, translateForLocale } from '@/i18n/translate-for-locale';

describe('interpolateTranslation', () => {
  it('fills double-brace placeholders used by locale tables', () => {
    expect(interpolateTranslation('{{percent}}% vector', { percent: 50 })).toBe('50% vector');
  });

  it('also fills single-brace placeholders so slider labels cannot show the token', () => {
    expect(interpolateTranslation('{percent}% vector', { percent: 50 })).toBe('50% vector');
  });
});

describe('keyword blend value copy', () => {
  it('renders a numeric percent for chat and search', () => {
    expect(translateForLocale('en', 'chatbot.models.rag.keywordBlendValue', { percent: 50 })).toBe(
      '50% vector',
    );
    expect(translateForLocale('en', 'search.models.rag.keywordBlendValue', { percent: 0 })).toBe(
      '0% vector',
    );
  });
});
