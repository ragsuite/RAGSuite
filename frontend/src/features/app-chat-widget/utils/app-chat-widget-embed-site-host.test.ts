import {
  hostnameFromEmbedSiteHost,
  normalizeEmbedSiteHost,
  resolveEmbedSiteHost,
} from '@/features/app-chat-widget/utils/app-chat-widget-embed-site-host';

describe('app-chat-widget-embed-site-host', () => {
  it('normalizes hostnames and origins with URL .host semantics', () => {
    expect(normalizeEmbedSiteHost('Shop.Example.com')).toBe('shop.example.com');
    expect(normalizeEmbedSiteHost('https://Help.Example.com/path')).toBe('help.example.com');
    expect(normalizeEmbedSiteHost('https://shop.example.com')).toBe('shop.example.com');
    expect(normalizeEmbedSiteHost('http://shop.example.com')).toBe('shop.example.com');
    expect(normalizeEmbedSiteHost('')).toBe('local');
    expect(normalizeEmbedSiteHost(null)).toBe('local');
  });

  it('keeps non-default ports so localhost sites isolate by port', () => {
    expect(normalizeEmbedSiteHost('http://localhost:9201')).toBe('localhost:9201');
    expect(normalizeEmbedSiteHost('http://localhost:5001')).toBe('localhost:5001');
    expect(normalizeEmbedSiteHost('localhost:5001')).toBe('localhost:5001');
    expect(normalizeEmbedSiteHost('http://localhost:9201')).not.toBe(
      normalizeEmbedSiteHost('http://localhost:5001'),
    );
  });

  it('strips port for allowlist hostname helpers', () => {
    expect(hostnameFromEmbedSiteHost('localhost:9201')).toBe('localhost');
    expect(hostnameFromEmbedSiteHost('http://localhost:5001')).toBe('localhost');
    expect(hostnameFromEmbedSiteHost('shop.example.com')).toBe('shop.example.com');
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

    expect(
      resolveEmbedSiteHost({
        parentOrigin: 'http://localhost:9201',
      }),
    ).toBe('localhost:9201');

    expect(resolveEmbedSiteHost({})).toBe('local');
  });
});
