import {
  isPublicEmbedLocation,
  isPublicEmbedPath,
  resolveIsEmbedShell,
} from '@/features/auth/utils/public-embed-path';

describe('isPublicEmbedPath', () => {
  it('detects embed chatbot and search routes', () => {
    expect(isPublicEmbedPath('/embed/chatbot')).toBe(true);
    expect(isPublicEmbedPath('/embed/chatbot?x=1')).toBe(true);
    expect(isPublicEmbedPath('/embed/search')).toBe(true);
    expect(isPublicEmbedPath('/embed/')).toBe(true);
  });

  it('rejects auth and app routes', () => {
    expect(isPublicEmbedPath('/sign-in')).toBe(false);
    expect(isPublicEmbedPath('/(auth)/sign-in')).toBe(false);
    expect(isPublicEmbedPath('/')).toBe(false);
    expect(isPublicEmbedPath('')).toBe(false);
    expect(isPublicEmbedPath(null)).toBe(false);
  });
});

describe('resolveIsEmbedShell', () => {
  it('prefers non-empty router pathname over window bootstrap', () => {
    expect(
      resolveIsEmbedShell({
        pathname: '/sign-in',
        windowPathname: '/embed/chatbot',
      }),
    ).toBe(false);

    expect(
      resolveIsEmbedShell({
        pathname: '/embed/chatbot',
        windowPathname: '/sign-in',
      }),
    ).toBe(true);
  });

  it('uses window bootstrap only when pathname is empty or root', () => {
    expect(
      resolveIsEmbedShell({
        pathname: '',
        windowPathname: '/embed/chatbot',
      }),
    ).toBe(true);

    expect(
      resolveIsEmbedShell({
        pathname: '/',
        windowPathname: '/embed/search',
      }),
    ).toBe(true);

    expect(
      resolveIsEmbedShell({
        pathname: '',
        windowPathname: '/sign-in',
      }),
    ).toBe(false);
  });
});

describe('isPublicEmbedLocation', () => {
  it('uses explicit pathname when provided', () => {
    expect(isPublicEmbedLocation('/embed/chatbot')).toBe(true);
    expect(isPublicEmbedLocation('/sign-in')).toBe(false);
  });
});
