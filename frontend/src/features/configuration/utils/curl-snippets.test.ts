import { buildN8nCurlSnippet, getN8nRequestDetails } from '@/features/configuration/utils/curl-snippets';

describe('curl-snippets API host', () => {
  it('builds n8n retrieve URL from API_URL, not the admin UI origin', () => {
    const details = getN8nRequestDetails('rgs_live_test_key');
    expect(details.url).toMatch(/^https?:\/\//);
    expect(details.url).toContain('/api/v1/retrieve');
    // Admin Expo UI is :9191; API is configured in env.json (typically :9090).
    expect(details.url).not.toContain(':9191');
  });

  it('includes the API retrieve path in the cURL snippet', () => {
    const snippet = buildN8nCurlSnippet('rgs_live_test_key');
    expect(snippet).toContain('/api/v1/retrieve');
    expect(snippet).not.toContain('localhost:9191');
  });
});
