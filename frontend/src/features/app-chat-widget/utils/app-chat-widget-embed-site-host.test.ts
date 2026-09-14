import {
  normalizeEmbedSiteHost,
  resolveEmbedSiteHost,
} from '@/features/app-chat-widget/utils/app-chat-widget-embed-site-host';

describe('app-chat-widget-embed-site-host', () => {
  it('normalizes hostnames and origins', () => {
    expect(normalizeEmbedSiteHost('Shop.Example.com')).toBe('shop.example.com');
    expect(normalizeEmbedSiteHost('https://Help.Example.com/path')).toBe('help.example.com');
    expect(normalizeEmbedSiteHost('')).toBe('local');
    expect(normalizeEmbedSiteHost(null)).toBe('local');
  });

  it('prefers explicit host then parentOrigin', () => {
    expect(
      resolveEmbedSiteHost({
        explicitHost: 'shop.example.com',
        parentOrigin: 'https://help.example.com',
      }),
    ).toBe('shop.example.com');

    expect(
      resolveEmbedSiteHost({
        parentOrigin: 'https://help.example.com/page',
      }),
    ).toBe('help.example.com');

    expect(resolveEmbedSiteHost({})).toBe('local');
  });
});
