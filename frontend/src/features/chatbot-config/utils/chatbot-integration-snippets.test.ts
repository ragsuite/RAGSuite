import {
  resolveBrowserApiBaseUrl,
} from '@/shared/utils/resolve-browser-api-base-url';
import { resolveWidgetAssetBase } from '@/shared/utils/resolve-widget-asset-base';
import {
  buildChatbotMobileIntegrationSnippet,
  buildChatbotWebIntegrationSnippet,
} from '@/features/chatbot-config/utils/chatbot-integration-snippets';
import {
  buildSearchMobileIntegrationSnippet,
  buildSearchWebIntegrationSnippet,
} from '@/features/search-config/utils/search-integration-snippets';

describe('resolveWidgetAssetBase', () => {
  it('prefers configured base over page origin', () => {
    expect(
      resolveWidgetAssetBase({
        configuredBase: 'https://admin.example.com/',
        pageOrigin: 'https://localhost:8081',
        apiBaseUrl: 'https://api.example.com/api/v1',
      }),
    ).toBe('https://admin.example.com');
  });

  it('falls back to page origin then api origin', () => {
    expect(
      resolveWidgetAssetBase({
        pageOrigin: 'https://admin.example.com',
        apiBaseUrl: 'https://api.example.com/api/v1',
      }),
    ).toBe('https://admin.example.com');
    expect(
      resolveWidgetAssetBase({
        apiBaseUrl: 'https://api.example.com/api/v1',
      }),
    ).toBe('https://api.example.com');
  });
});

describe('resolveBrowserApiBaseUrl', () => {
  it('keeps absolute api base and strips trailing slash', () => {
    expect(
      resolveBrowserApiBaseUrl('https://api.example.com/api/v1/', {
        pageOrigin: 'https://admin.example.com',
        assetOrigin: 'https://admin.example.com',
      }),
    ).toBe('https://api.example.com/api/v1');
  });

  it('rewrites private api host to public asset origin', () => {
    expect(
      resolveBrowserApiBaseUrl('http://127.0.0.1:8000/api/v1', {
        pageOrigin: 'https://admin.example.com',
        assetOrigin: 'https://admin.example.com',
      }),
    ).toBe('https://admin.example.com/api/v1');
  });

  it('appends default api path when endpoint is origin only', () => {
    expect(
      resolveBrowserApiBaseUrl('https://rag.heh.keeen.net', {
        pageOrigin: 'https://t3karma-v14.thebetaspace.com',
        assetOrigin: 'https://rag.heh.keeen.net',
      }),
    ).toBe('https://rag.heh.keeen.net/api/v1');
  });
});

describe('integration snippets (reference parity)', () => {
  it('chatbot script src uses asset host /widget/v1/ragsuite-init.js', () => {
    const snippet = buildChatbotWebIntegrationSnippet(
      'bust123',
      'proj-1',
      'https://api.example.com/api/v1',
      'https://admin.example.com',
    );
    expect(snippet).toContain(
      'src="https://admin.example.com/widget/v1/ragsuite-init.js?v=bust123"',
    );
    expect(snippet).toContain('data-ragsuite-project-id="proj-1"');
    expect(snippet).toContain('data-api-endpoint="https://api.example.com/api/v1"');
    expect(snippet).not.toContain('src="https://api.example.com/api/v1/widget/');
  });

  it('search script src uses asset host /search-widget/v1/ragsuite-init.js', () => {
    const snippet = buildSearchWebIntegrationSnippet(
      'bust456',
      'proj-2',
      'https://api.example.com/api/v1',
      'https://admin.example.com',
    );
    expect(snippet).toContain(
      'src="https://admin.example.com/search-widget/v1/ragsuite-init.js?v=bust456"',
    );
    expect(snippet).toContain('data-api-endpoint="https://api.example.com/api/v1"');
  });
});

describe('mobile integration snippets', () => {
  it('chatbot mobile snippet uses @nitsan-ai/react-native-init and rgs_live_ key', () => {
    const snippet = buildChatbotMobileIntegrationSnippet({
      projectId: 'proj-chat',
      apiKey: 'rgs_live_test_key',
      endpoint: 'https://api.example.com/api/v1/',
    });
    expect(snippet).toContain('@nitsan-ai/react-native-init');
    expect(snippet).toContain('RAGSuiteProvider');
    expect(snippet).toContain('RAGSuiteChat');
    expect(snippet).toContain('rgs_live_test_key');
    expect(snippet).toContain('https://api.example.com/api/v1');
    expect(snippet).not.toContain('cb_live_');
    expect(snippet).not.toContain('embed_token');
    const legacyMobilePkg = ['@', 'rn-test', '/react-native-init'].join('');
    expect(snippet).not.toContain(legacyMobilePkg);
  });

  it('search mobile snippet uses @nitsan-ai/react-native-init and RAGSuiteSearch', () => {
    const snippet = buildSearchMobileIntegrationSnippet({
      projectId: 'proj-search',
      apiKey: 'rgs_live_search_key',
      endpoint: 'https://api.example.com/api/v1',
    });
    expect(snippet).toContain('@nitsan-ai/react-native-init');
    expect(snippet).toContain('RAGSuiteProvider');
    expect(snippet).toContain('RAGSuiteSearch');
    expect(snippet).toContain("features={['search']}");
    expect(snippet).toContain('rgs_live_search_key');
    expect(snippet).not.toContain('cb_live_');
    expect(snippet).not.toContain('embed_token');
    const legacyMobilePkg = ['@', 'rn-test', '/react-native-init'].join('');
    expect(snippet).not.toContain(legacyMobilePkg);
  });
});
