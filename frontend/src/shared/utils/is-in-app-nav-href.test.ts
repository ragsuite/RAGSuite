import { isInAppNavHref } from '@/shared/utils/is-in-app-nav-href';

describe('isInAppNavHref', () => {
  it('allows Expo app routes only', () => {
    expect(isInAppNavHref('/(app)/chatbot-config')).toBe(true);
    expect(isInAppNavHref('/(app)/chatbot-config/chat-widget-customization')).toBe(true);
    expect(isInAppNavHref('/(app)')).toBe(true);
    expect(isInAppNavHref('/api/v1/documents/x')).toBe(false);
    expect(isInAppNavHref('https://example.com')).toBe(false);
    expect(isInAppNavHref('')).toBe(false);
  });
});
