import {
  getVisitorLanguageStorageKey,
  normalizeVisitorLanguage,
  resolveEffectiveLanguage,
  toApiVisitorLanguage,
  writeVisitorLanguage,
  readVisitorLanguage,
} from '@/platform/widget-visitor-language';

describe('widget-visitor-language', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  it('normalizes chatbot and search-box language codes', () => {
    expect(normalizeVisitorLanguage('en-us')).toBe('en');
    expect(normalizeVisitorLanguage('en_US')).toBe('en');
    expect(normalizeVisitorLanguage('pt-br')).toBe('pt');
    expect(normalizeVisitorLanguage('zh-cn')).toBe('zh');
    expect(normalizeVisitorLanguage('hi')).toBe('hi');
    expect(normalizeVisitorLanguage('en-gb')).toBe('en-gb');
    expect(normalizeVisitorLanguage('nope')).toBe('');
  });

  it('scopes storage keys by project and site host', () => {
    expect(getVisitorLanguageStorageKey('abc', 'shop.example.com')).toBe(
      'ragsuite_visitor_language_abc_shop.example.com',
    );
    expect(getVisitorLanguageStorageKey('abc', 'https://Shop.Example.com:443/path')).toBe(
      'ragsuite_visitor_language_abc_shop.example.com',
    );
  });

  it('resolves effective language preferring visitor over admin', () => {
    expect(resolveEffectiveLanguage('en', 'hi')).toBe('en');
    expect(resolveEffectiveLanguage('', 'hi')).toBe('hi');
    expect(resolveEffectiveLanguage(null, null)).toBe('en');
  });

  it('maps to API language codes', () => {
    expect(toApiVisitorLanguage('en-us')).toBe('en');
    expect(toApiVisitorLanguage('en-gb')).toBe('en-gb');
    expect(toApiVisitorLanguage('pt-br')).toBe('pt');
  });

  it('reads and writes visitor language per site', () => {
    writeVisitorLanguage('proj1', 'a.example.com', 'de');
    writeVisitorLanguage('proj1', 'b.example.com', 'fr');
    expect(readVisitorLanguage('proj1', 'a.example.com')).toBe('de');
    expect(readVisitorLanguage('proj1', 'b.example.com')).toBe('fr');
  });
});
