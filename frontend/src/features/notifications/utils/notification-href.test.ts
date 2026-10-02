import { hrefFromActionUrl } from '@/features/notifications/utils/notification-href';

describe('hrefFromActionUrl', () => {
  it('maps legacy /api-keys to MCP', () => {
    expect(hrefFromActionUrl('/api-keys')).toBe('/(app)/mcp');
  });

  it('maps /n8n to MCP', () => {
    expect(hrefFromActionUrl('/n8n/inbound')).toBe('/(app)/mcp');
  });

  it('maps /crawl to crawl-management tab', () => {
    expect(hrefFromActionUrl('/crawl')).toBe('/(app)/(tabs)/crawl-management');
  });

  it('preserves profile query params', () => {
    expect(hrefFromActionUrl('/profile?tab=security')).toBe('/(app)/profile?tab=security');
  });

  it('maps /integrations to crawl-management', () => {
    expect(hrefFromActionUrl('/integrations')).toBe('/(app)/(tabs)/crawl-management');
  });
});
