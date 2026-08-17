import { buildChatbotEmbedAssetUrls } from '@/features/chatbot-config/utils/check-embed-readiness';

describe('buildChatbotEmbedAssetUrls', () => {
  it('builds init on asset host and loader candidates on api host', () => {
    const urls = buildChatbotEmbedAssetUrls({
      assetBase: 'https://admin.example.com',
      apiEndpoint: 'https://api.example.com/api/v1',
      cacheBust: 't1',
    });

    expect(urls.initUrl).toBe('https://admin.example.com/widget/v1/ragsuite-init.js?v=t1');
    expect(urls.loaderCandidates).toContain(
      'https://admin.example.com/widget/v1/loader.js?v=t1',
    );
    expect(urls.loaderCandidates).toContain(
      'https://api.example.com/api/v1/widget/v1/loader.js?v=t1',
    );
    expect(urls.loaderCandidates).not.toContain(
      'https://admin.example.com/widget/v1/widget.umd.js?v=t1',
    );
    expect(urls.loaderCandidates).not.toContain('https://api.example.com/widget/v1/loader.js?v=t1');
  });
});
