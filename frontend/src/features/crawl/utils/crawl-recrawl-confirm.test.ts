import type {
  CrawlEmbeddingTargetOptions,
  CrawlSource,
} from '@/features/crawl/types/crawl.types';
import type { ItemEmbeddingCoverageEntry } from '@/features/search-config/types/embedding.types';
import {
  buildManualRecrawlConfirmCopy,
  resolveManualRecrawlConfirmContent,
} from '@/features/crawl/utils/crawl-recrawl-confirm';

function sampleSource(overrides: Partial<CrawlSource> = {}): CrawlSource {
  return {
    id: 'source-1',
    name: 'Example',
    base_url: 'https://example.com',
    depth: 2,
    cadence: 'ONCE',
    headless_mode: 'OFF',
    allowlist: [],
    denylist: [],
    skip_header_footer: true,
    description: '',
    status: 'IDLE',
    is_active: true,
    rescope_root_links: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    last_crawl_at: '2026-09-07T10:00:00Z',
    documents_count: 10,
    trained_at: '2026-09-07T10:00:00Z',
    pipeline_status: 'idle',
    is_search_ready: true,
    created_by: 'user',
    latest_job_id: null,
    active_job_id: null,
    progress_percentage: null,
    status_message: '',
    ingest_embedding_target: 'search',
    indexed_embedding_models: [],
    ...overrides,
  };
}

const embeddingOptions: CrawlEmbeddingTargetOptions = {
  same_collection: false,
  default_target: 'search',
  search: {
    source: 'search',
    provider: 'openai',
    model: 'text-embedding-3-small',
    collection: 'proj_search',
  },
  chat: {
    source: 'chat',
    provider: 'mistral',
    model: 'mistral-embed',
    collection: 'proj_chat',
  },
};

describe('resolveManualRecrawlConfirmContent', () => {
  it('uses switch copy when coverage is on a different destination than configured', () => {
    const coverage: ItemEmbeddingCoverageEntry = {
      id: 'source-1',
      embedded_models: [
        {
          provider: 'mistral',
          model: 'mistral-embed',
          collection: 'proj_chat',
          is_active: true,
        },
      ],
      missing_active: false,
    };
    const content = resolveManualRecrawlConfirmContent(
      sampleSource({ ingest_embedding_target: 'search' }),
      coverage,
      embeddingOptions,
    );
    expect(content.kind).toBe('switch');
    expect(content.indexedModelLabel).toContain('mistral');
    expect(content.configuredModelLabel).toContain('openai');
  });

  it('uses same-destination copy when coverage matches configured target', () => {
    const coverage: ItemEmbeddingCoverageEntry = {
      id: 'source-1',
      embedded_models: [
        {
          provider: 'openai',
          model: 'text-embedding-3-small',
          collection: 'proj_search',
          is_active: true,
        },
      ],
      missing_active: false,
    };
    const content = resolveManualRecrawlConfirmContent(
      sampleSource({ ingest_embedding_target: 'search' }),
      coverage,
      embeddingOptions,
    );
    expect(content.kind).toBe('same');
    expect(content.indexedModelLabel).toContain('openai');
  });

  it('treats retagged mistral-as-search API list as switch when coverage is chat collection', () => {
    const coverage: ItemEmbeddingCoverageEntry = {
      id: 'source-1',
      embedded_models: [
        {
          provider: 'mistral',
          model: 'mistral-embed',
          collection: 'proj_chat',
          is_active: true,
        },
      ],
      missing_active: false,
    };
    const content = resolveManualRecrawlConfirmContent(
      sampleSource({
        ingest_embedding_target: 'search',
        indexed_embedding_models: [
          {
            provider: 'mistral',
            model: 'mistral-embed',
            collection: 'proj_chat',
            source: 'search',
          },
        ],
      }),
      coverage,
      embeddingOptions,
    );
    expect(content.kind).toBe('switch');
    expect(content.indexedModelLabel).toContain('mistral');
    expect(content.configuredModelLabel).toContain('openai');
  });
});

describe('buildManualRecrawlConfirmCopy', () => {
  const t = (key: string, options?: Record<string, string>) => {
    if (options) return `${key}:${JSON.stringify(options)}`;
    return key;
  };

  it('builds switch message with both model labels', () => {
    const copy = buildManualRecrawlConfirmCopy(
      {
        kind: 'switch',
        indexedModelLabel: 'mistral / mistral-embed',
        configuredModelLabel: 'openai / text-embedding-3-small',
      },
      t,
    );
    expect(copy.title).toBe('crawl.confirm.recrawl.switch.title');
    expect(copy.message).toContain('mistral / mistral-embed');
    expect(copy.message).toContain('openai / text-embedding-3-small');
  });

  it('builds same-destination message from actual indexed model, not configured-only', () => {
    const copy = buildManualRecrawlConfirmCopy(
      {
        kind: 'same',
        indexedModelLabel: 'openai / text-embedding-3-small',
        configuredModelLabel: 'openai / text-embedding-3-small',
      },
      t,
    );
    expect(copy.title).toBe('crawl.confirm.recrawl.title');
    expect(copy.message).toContain('openai / text-embedding-3-small');
  });

  it('does not claim indexed with configured model when only configured label is set', () => {
    const copy = buildManualRecrawlConfirmCopy(
      {
        kind: 'same',
        indexedModelLabel: null,
        configuredModelLabel: 'openai / text-embedding-3-small',
      },
      t,
    );
    // Falls back to configured only when no coverage label exists (first crawl).
    expect(copy.message).toContain('openai / text-embedding-3-small');
  });
});
