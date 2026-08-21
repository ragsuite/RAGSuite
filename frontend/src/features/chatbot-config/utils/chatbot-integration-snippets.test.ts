import {
  resolveBrowserApiBaseUrl,
} from '@/shared/utils/resolve-browser-api-base-url';
import {
  buildChatbotMobileIntegrationSnippet,
  buildChatbotWebIntegrationSnippet,
} from '@/features/chatbot-config/utils/chatbot-integration-snippets';
import {
  buildSearchMobileIntegrationSnippet,
  buildSearchWebIntegrationSnippet,
} from '@/features/search-config/utils/search-integration-snippets';

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
      resolveBrowserApiBaseUrl('https://widgets.example.com', {
        pageOrigin: 'https://customer.example.com',
        assetOrigin: 'https://widgets.example.com',
      }),
    ).toBe('https://widgets.example.com/api/v1');
  });

  it('coerces protocol-less api host to https before resolving', () => {
    expect(
      resolveBrowserApiBaseUrl('widgets.example.com/api/v1', {
        pageOrigin: 'https://customer.example.com/elements/accordions/',
        assetOrigin: 'widgets.example.com',
      }),
    ).toBe('https://widgets.example.com/api/v1');
  });
});

describe('integration snippets (reference parity)', () => {
  it('coerces protocol-less asset and api hosts in snippets', () => {
    const chat = buildChatbotWebIntegrationSnippet(
      'bust123',
      'proj-1',
      'widgets.example.com/api/v1',
      'widgets.example.com',
    );
    expect(chat).toContain(
      'src="https://widgets.example.com/widget/v1/ragsuite-init.js?v=bust123"',
    );
    expect(chat).toContain('data-api-endpoint="https://widgets.example.com/api/v1"');

    const search = buildSearchWebIntegrationSnippet(
      'bust456',
      'proj-2',
      'widgets.example.com/api/v1',
      'widgets.example.com',
    );
    expect(search).toContain(
      'src="https://widgets.example.com/search-widget/v1/ragsuite-init.js?v=bust456"',
    );
    expect(search).toContain('data-api-endpoint="https://widgets.example.com/api/v1"');
  });

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
  it('defaults cache-bust to stable WIDGET_EMBED_ASSET_VERSION and documents contracts', () => {
    const chat = buildChatbotWebIntegrationSnippet(
      undefined,
      'proj-1',
      'https://api.example.com/api/v1',
      'https://admin.example.com',
    );
    expect(chat).toContain('data-cache-bust="20260821"');
    expect(chat).toContain('WIDGET_ASSET_VERSION');
    expect(chat).toContain('ragsuite-chatbot-host');
    expect(chat).toContain('launcherLabel');
    expect(chat).toContain('"latest"');

    const search = buildSearchWebIntegrationSnippet(
      undefined,
      'proj-2',
      'https://api.example.com/api/v1',
      'https://admin.example.com',
    );
    expect(search).toContain('data-cache-bust="20260821"');
    expect(search).toContain('data-container="#your-slot"');
    expect(search).toContain('ragsuite:focus');
    expect(search).toContain('mountTo');
    expect(search).toContain('"latest"');
  });
});

describe('mobile integration snippets', () => {
  it('chatbot mobile snippet uses @ragsuite/react-native and rgs_live_ key', () => {
    const snippet = buildChatbotMobileIntegrationSnippet({
      projectId: 'proj-chat',
      apiKey: 'rgs_live_test_key',
      endpoint: 'https://api.example.com/api/v1/',
    });
    expect(snippet).toContain('@ragsuite/react-native');
    expect(snippet).toContain('RAGSuiteProvider');
    expect(snippet).toContain('RAGSuiteChat');
    expect(snippet).toContain('rgs_live_test_key');
    expect(snippet).toContain('https://api.example.com/api/v1');
    expect(snippet).not.toContain('cb_live_');
    expect(snippet).not.toContain('embed_token');
    expect(snippet).not.toContain('@nitsan-ai/react-native-init');
    expect(snippet).not.toContain('@ragsuite/react-native-init');
  });

  it('search mobile snippet uses @ragsuite/react-native and RAGSuiteSearch', () => {
    const snippet = buildSearchMobileIntegrationSnippet({
      projectId: 'proj-search',
      apiKey: 'rgs_live_search_key',
      endpoint: 'https://api.example.com/api/v1',
    });
    expect(snippet).toContain('@ragsuite/react-native');
    expect(snippet).toContain('RAGSuiteProvider');
    expect(snippet).toContain('RAGSuiteSearch');
    expect(snippet).toContain("features={['search']}");
    expect(snippet).toContain('rgs_live_search_key');
    expect(snippet).not.toContain('cb_live_');
    expect(snippet).not.toContain('embed_token');
    expect(snippet).not.toContain('@nitsan-ai/react-native-init');
    expect(snippet).not.toContain('@ragsuite/react-native-init');
  });
});
