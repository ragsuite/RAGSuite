import { resolveSearchSubmitQuery } from './resolve-search-submit-query';

describe('resolveSearchSubmitQuery', () => {
  it('uses string override when provided', () => {
    expect(resolveSearchSubmitQuery('  hello world  ', 'fallback')).toBe('hello world');
  });

  it('falls back to query when override is missing', () => {
    expect(resolveSearchSubmitQuery(undefined, '  typed query  ')).toBe('typed query');
  });

  it('ignores press/submit event objects (truthy non-strings)', () => {
    const fakeEvent = { nativeEvent: { text: 'ignored' }, type: 'submitEditing' };
    expect(resolveSearchSubmitQuery(fakeEvent, 'what is nitsan?')).toBe('what is nitsan?');
  });

  it('ignores empty-string override only when it is a string (explicit clear)', () => {
    expect(resolveSearchSubmitQuery('', 'fallback')).toBe('');
  });
});
