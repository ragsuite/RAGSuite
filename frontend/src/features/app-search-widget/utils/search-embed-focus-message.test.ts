import { isSearchEmbedFocusMessage } from '@/features/app-search-widget/utils/search-embed-focus-message';

describe('isSearchEmbedFocusMessage', () => {
  it('accepts CEO shorthand type', () => {
    expect(isSearchEmbedFocusMessage({ type: 'ragsuite:focus' })).toBe(true);
  });

  it('accepts sourced host focus', () => {
    expect(isSearchEmbedFocusMessage({ source: 'ragsuite-search-host', type: 'focus' })).toBe(true);
  });

  it('rejects other messages', () => {
    expect(isSearchEmbedFocusMessage(null)).toBe(false);
    expect(isSearchEmbedFocusMessage({ type: 'resize' })).toBe(false);
    expect(isSearchEmbedFocusMessage({ source: 'ragsuite-search-host', type: 'resize' })).toBe(false);
    expect(isSearchEmbedFocusMessage({ source: 'other', type: 'focus' })).toBe(false);
  });
});
