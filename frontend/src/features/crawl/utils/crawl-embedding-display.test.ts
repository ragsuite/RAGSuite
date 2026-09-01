import type { CrawlSource } from '@/features/crawl/types/crawl.types';
import {
  crawlSourceHasIndexedData,
  crawlSourceHasIndexedDataForTarget,
  dedupeCrawlEmbeddedModels,
  expandCrawlSourceTableRows,
  expandCrawlSourcesForTable,
  formatCrawlEmbeddedModelLabel,
  resolveCrawlSourceModelLabels,
  resolveCrawlSourceSurfaceTag,
  resolveEditEmbeddingTargetFeedback,
  resolveEffectiveIngestTarget,
  shouldShowCrawlEmbeddingCoverageWarning,
} from '@/features/crawl/utils/crawl-embedding-display';

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
    last_crawl_at: null,
    documents_count: 0,
    trained_at: null,
    pipeline_status: 'idle',
    is_search_ready: false,
    created_by: 'user',
    latest_job_id: null,
    active_job_id: null,
    progress_percentage: null,
    status_message: '',
    ...overrides,
  };
}

const embeddingOptions = {
  search: {
    source: 'search' as const,
    provider: 'openai',
    model: 'text-embedding-3-small',
    collection: 'proj_openai',
  },
  chat: {
    source: 'chat' as const,
    provider: 'mistral',
    model: 'mistral-embed',
    collection: 'proj_mistral',
  },
  same_collection: false,
  default_target: 'chat' as const,
};

describe('crawl-embedding-display', () => {
  it('formats provider and model', () => {
    expect(
      formatCrawlEmbeddedModelLabel({
        provider: 'mistral',
        model: 'mistral-embed',
        collection: 'proj_mistral',
      }),
    ).toBe('mistral / mistral-embed');
  });

  it('dedupes models by collection', () => {
    const models = dedupeCrawlEmbeddedModels([
      { provider: 'mistral', model: 'mistral-embed', collection: 'proj_a' },
      { provider: 'mistral', model: 'mistral-embed', collection: 'proj_a' },
    ]);
    expect(models).toHaveLength(1);
  });

  it('uses configured models for pending both sources', () => {
    const source = sampleSource({
      ingest_embedding_target: 'both',
      indexed_embedding_models: [
        { provider: 'openai', model: 'text-embedding-3-small', collection: 'proj_openai', source: 'search' },
        { provider: 'mistral', model: 'mistral-embed', collection: 'proj_mistral', source: 'chat' },
      ],
    });

    const labels = resolveCrawlSourceModelLabels(source, {
      id: source.id,
      embedded_models: [],
      missing_active: true,
    });

    expect(labels).toEqual(['openai / text-embedding-3-small', 'mistral / mistral-embed']);
  });

  it('expands both with different models into one row with stacked labels', () => {
    const source = sampleSource({
      ingest_embedding_target: 'both',
      indexed_embedding_models: [
        { provider: 'openai', model: 'text-embedding-3-small', collection: 'proj_openai', source: 'search' },
        { provider: 'mistral', model: 'mistral-embed', collection: 'proj_mistral', source: 'chat' },
      ],
    });

    const rows = expandCrawlSourceTableRows(source);
    expect(rows).toHaveLength(1);
    expect(rows[0].modelLabels).toEqual([
      'openai / text-embedding-3-small',
      'mistral / mistral-embed',
    ]);
  });

  it('resolves surface tags from explicit ingest targets', () => {
    expect(
      resolveCrawlSourceSurfaceTag(sampleSource({ ingest_embedding_target: 'chat' })),
    ).toBe('chat');
    expect(
      resolveCrawlSourceSurfaceTag(sampleSource({ ingest_embedding_target: 'search' })),
    ).toBe('search');
    expect(
      resolveCrawlSourceSurfaceTag(sampleSource({ ingest_embedding_target: 'both' })),
    ).toBe('both');
  });

  it('tags legacy null ingest target as both', () => {
    const source = sampleSource({
      ingest_embedding_target: null,
      indexed_embedding_models: [
        { provider: 'mistral', model: 'mistral-embed', collection: 'proj_mistral', source: 'chat' },
      ],
    });

    expect(resolveCrawlSourceSurfaceTag(source, embeddingOptions)).toBe('both');
  });

  it('shows only indexed models for trained legacy sources', () => {
    const source = sampleSource({
      ingest_embedding_target: null,
      trained_at: '2026-01-02T00:00:00.000Z',
      indexed_embedding_models: [
        { provider: 'mistral', model: 'mistral-embed', collection: 'proj_mistral' },
      ],
    });

    const labels = resolveCrawlSourceModelLabels(source, {
      id: source.id,
      embedded_models: [
        {
          provider: 'mistral',
          model: 'mistral-embed',
          collection: 'proj_mistral',
          is_active: true,
        },
      ],
      missing_active: false,
    }, embeddingOptions);

    expect(labels).toEqual(['mistral / mistral-embed']);
  });

  it('ignores current project search config when source was indexed with mistral only', () => {
    const source = sampleSource({
      ingest_embedding_target: null,
      trained_at: '2026-01-02T00:00:00.000Z',
      indexed_embedding_models: [
        { provider: 'mistral', model: 'mistral-embed', collection: 'proj_mistral' },
      ],
    });

    const coverage = {
      id: source.id,
      embedded_models: [
        {
          provider: 'mistral',
          model: 'mistral-embed',
          collection: 'proj_mistral',
          is_active: true,
        },
      ],
      missing_active: false,
    };

    const openAiSearchOptions = {
      ...embeddingOptions,
      search: {
        ...embeddingOptions.search,
        provider: 'openai',
        model: 'text-embedding-3-small',
        collection: 'proj_openai',
      },
    };

    expect(resolveCrawlSourceModelLabels(source, coverage, embeddingOptions)).toEqual([
      'mistral / mistral-embed',
    ]);
    expect(resolveCrawlSourceModelLabels(source, coverage, openAiSearchOptions)).toEqual([
      'mistral / mistral-embed',
    ]);
  });

  it('shows both indexed models when coverage has two collections', () => {
    const source = sampleSource({
      ingest_embedding_target: null,
      trained_at: '2026-01-02T00:00:00.000Z',
      indexed_embedding_models: [
        { provider: 'mistral', model: 'mistral-embed', collection: 'proj_mistral' },
      ],
    });

    const labels = resolveCrawlSourceModelLabels(source, {
      id: source.id,
      embedded_models: [
        {
          provider: 'openai',
          model: 'text-embedding-3-small',
          collection: 'proj_openai',
          is_active: false,
        },
        {
          provider: 'mistral',
          model: 'mistral-embed',
          collection: 'proj_mistral',
          is_active: true,
        },
      ],
      missing_active: false,
    }, embeddingOptions);

    expect(labels).toEqual([
      'mistral / mistral-embed',
      'openai / text-embedding-3-small',
    ]);
  });

  it('expands legacy sources as a single row with stacked model labels', () => {
    const source = sampleSource({
      ingest_embedding_target: null,
      trained_at: '2026-01-02T00:00:00.000Z',
      indexed_embedding_models: [
        { provider: 'mistral', model: 'mistral-embed', collection: 'proj_mistral' },
      ],
    });

    const rows = expandCrawlSourceTableRows(source, {
      id: source.id,
      embedded_models: [
        {
          provider: 'mistral',
          model: 'mistral-embed',
          collection: 'proj_mistral',
          is_active: true,
        },
      ],
      missing_active: false,
    }, embeddingOptions);

    expect(rows).toHaveLength(1);
    expect(rows[0].modelLabels).toEqual(['mistral / mistral-embed']);
  });

  it('expands one table row per source with model labels', () => {
    const sources = [
      sampleSource({
        id: 'a',
        ingest_embedding_target: 'chat',
        indexed_embedding_models: [
          { provider: 'mistral', model: 'mistral-embed', collection: 'proj_mistral', source: 'chat' },
        ],
      }),
      sampleSource({
        id: 'b',
        ingest_embedding_target: 'both',
        indexed_embedding_models: [
          { provider: 'openai', model: 'text-embedding-3-small', collection: 'proj_openai', source: 'search' },
          { provider: 'mistral', model: 'mistral-embed', collection: 'proj_mistral', source: 'chat' },
        ],
      }),
    ];

    const rows = expandCrawlSourcesForTable(sources, undefined, embeddingOptions);
    expect(rows).toHaveLength(2);
    expect(rows[0].modelLabels).toEqual(['mistral / mistral-embed']);
    expect(rows[1].modelLabels).toEqual([
      'openai / text-embedding-3-small',
      'mistral / mistral-embed',
    ]);
  });

  it('keeps one row when both models share a collection', () => {
    const source = sampleSource({
      ingest_embedding_target: 'both',
      indexed_embedding_models: [
        { provider: 'openai', model: 'text-embedding-3-small', collection: 'proj_openai', source: 'search' },
      ],
    });

    const rows = expandCrawlSourceTableRows(source);
    expect(rows).toHaveLength(1);
  });

  it('detects indexed data from trained_at or coverage', () => {
    expect(crawlSourceHasIndexedData(sampleSource(), null)).toBe(false);
    expect(crawlSourceHasIndexedData(sampleSource({ trained_at: '2026-01-02T00:00:00.000Z' }), null)).toBe(true);
    expect(
      crawlSourceHasIndexedData(sampleSource(), {
        id: 'source-1',
        embedded_models: [{ provider: 'openai', model: 'small', collection: 'proj_openai', is_active: true }],
        missing_active: false,
      }),
    ).toBe(true);
  });

  it('shows all indexed collections for search-target source with cross-index coverage', () => {
    const source = sampleSource({
      ingest_embedding_target: 'search',
      indexed_embedding_models: [
        { provider: 'openai', model: 'text-embedding-3-small', collection: 'proj_openai', source: 'search' },
      ],
    });

    const labels = resolveCrawlSourceModelLabels(source, {
      id: source.id,
      embedded_models: [
        {
          provider: 'mistral',
          model: 'mistral-embed',
          collection: 'proj_mistral',
          is_active: true,
        },
      ],
      missing_active: false,
    });

    expect(labels).toEqual([
      'openai / text-embedding-3-small',
      'mistral / mistral-embed',
    ]);
  });

  it('shows chat model when chat target has coverage in chat collection', () => {
    const source = sampleSource({
      ingest_embedding_target: 'chat',
      trained_at: '2026-01-02T00:00:00.000Z',
      indexed_embedding_models: [
        { provider: 'mistral', model: 'mistral-embed', collection: 'proj_mistral', source: 'chat' },
      ],
    });

    const labels = resolveCrawlSourceModelLabels(source, {
      id: source.id,
      embedded_models: [
        {
          provider: 'mistral',
          model: 'mistral-embed',
          collection: 'proj_mistral',
          is_active: true,
        },
      ],
      missing_active: false,
    });

    expect(labels).toEqual(['mistral / mistral-embed']);
  });

  it('detects indexed data only in target collection', () => {
    const source = sampleSource({
      ingest_embedding_target: 'search',
      trained_at: '2026-01-02T00:00:00.000Z',
      indexed_embedding_models: [
        { provider: 'openai', model: 'text-embedding-3-small', collection: 'proj_openai', source: 'search' },
      ],
    });

    const chatOnlyCoverage = {
      id: source.id,
      embedded_models: [
        {
          provider: 'mistral',
          model: 'mistral-embed',
          collection: 'proj_mistral',
          is_active: true,
        },
      ],
      missing_active: false,
    };

    expect(crawlSourceHasIndexedDataForTarget(source, chatOnlyCoverage, 'search', embeddingOptions)).toBe(
      false,
    );
    expect(crawlSourceHasIndexedDataForTarget(source, chatOnlyCoverage, 'chat', embeddingOptions)).toBe(
      true,
    );
  });

  it('returns edit feedback only when indexed in target collection', () => {
    const t = (key: string, options?: Record<string, string>) =>
      `${key}:${options?.model ?? options?.currentModel ?? options?.indexedModel ?? ''}:${options?.nextModel ?? options?.targetModel ?? ''}`;

    const indexedChat = sampleSource({
      ingest_embedding_target: 'chat',
      trained_at: '2026-01-02T00:00:00.000Z',
      indexed_embedding_models: [
        { provider: 'mistral', model: 'mistral-embed', collection: 'proj_mistral', source: 'chat' },
      ],
    });

    const chatCoverage = {
      id: indexedChat.id,
      embedded_models: [
        {
          provider: 'mistral',
          model: 'mistral-embed',
          collection: 'proj_mistral',
          is_active: true,
        },
      ],
      missing_active: false,
    };

    expect(
      resolveEditEmbeddingTargetFeedback({
        source: indexedChat,
        originalTarget: 'chat',
        nextTarget: 'chat',
        coverageEntry: chatCoverage,
        embeddingOptions,
        t,
      }),
    ).toEqual({
      warning: null,
      info: 'crawl.form.embeddingTarget.editInfo.alreadyIndexed:mistral / mistral-embed:',
    });

    expect(
      resolveEditEmbeddingTargetFeedback({
        source: indexedChat,
        originalTarget: 'chat',
        nextTarget: 'search',
        coverageEntry: chatCoverage,
        embeddingOptions,
        t,
      }),
    ).toEqual({
      warning:
        'crawl.form.embeddingTarget.editWarning.switchModel:mistral / mistral-embed:openai / text-embedding-3-small',
      info: null,
    });
  });

  it('shows mismatch warning when trained but vectors are in another collection', () => {
    const t = (key: string, options?: Record<string, string>) =>
      `${key}:${options?.indexedModel ?? ''}:${options?.targetModel ?? ''}`;

    const searchTargetSource = sampleSource({
      ingest_embedding_target: 'search',
      trained_at: '2026-01-02T00:00:00.000Z',
      is_search_ready: true,
      indexed_embedding_models: [
        { provider: 'openai', model: 'text-embedding-3-small', collection: 'proj_openai', source: 'search' },
      ],
    });

    const chatOnlyCoverage = {
      id: searchTargetSource.id,
      embedded_models: [
        {
          provider: 'mistral',
          model: 'mistral-embed',
          collection: 'proj_mistral',
          is_active: true,
        },
      ],
      missing_active: true,
    };

    expect(
      resolveEditEmbeddingTargetFeedback({
        source: searchTargetSource,
        originalTarget: 'search',
        nextTarget: 'search',
        coverageEntry: chatOnlyCoverage,
        embeddingOptions,
        t,
      }),
    ).toEqual({
      warning:
        'crawl.form.embeddingTarget.editWarning.indexedOtherCollection:mistral / mistral-embed:openai / text-embedding-3-small',
      info: null,
    });
  });

  it('shows chat model for untagged indexed models with chat coverage', () => {
    const source = sampleSource({
      ingest_embedding_target: 'chat',
      trained_at: '2026-01-02T00:00:00.000Z',
      is_search_ready: true,
      indexed_embedding_models: [
        {
          provider: 'openai',
          model: 'text-embedding-3-small',
          collection: 'proj_openai',
        },
      ],
    });

    const labels = resolveCrawlSourceModelLabels(source, {
      id: source.id,
      embedded_models: [
        {
          provider: 'openai',
          model: 'text-embedding-3-small',
          collection: 'proj_openai',
          is_active: true,
        },
      ],
      missing_active: false,
    });

    expect(labels).toEqual(['openai / text-embedding-3-small']);
  });

  it('infers effective ingest target for legacy untagged models by collection', () => {
    const legacyOpenAi = sampleSource({
      ingest_embedding_target: null,
      indexed_embedding_models: [
        { provider: 'openai', model: 'text-embedding-3-small', collection: 'proj_openai' },
      ],
    });
    const legacyMistral = sampleSource({
      ingest_embedding_target: null,
      indexed_embedding_models: [
        { provider: 'mistral', model: 'mistral-embed', collection: 'proj_mistral' },
      ],
    });

    expect(resolveEffectiveIngestTarget(legacyOpenAi, embeddingOptions)).toBe('search');
    expect(resolveEffectiveIngestTarget(legacyMistral, embeddingOptions)).toBe('chat');
  });

  it('shows already-indexed edit info for legacy openai sources', () => {
    const t = (key: string, options?: Record<string, string>) =>
      `${key}:${options?.model ?? ''}`;

    const legacySource = sampleSource({
      ingest_embedding_target: null,
      trained_at: '2026-01-02T00:00:00.000Z',
      indexed_embedding_models: [
        { provider: 'openai', model: 'text-embedding-3-small', collection: 'proj_openai' },
      ],
    });

    const coverage = {
      id: legacySource.id,
      embedded_models: [
        {
          provider: 'openai',
          model: 'text-embedding-3-small',
          collection: 'proj_openai',
          is_active: true,
        },
      ],
      missing_active: false,
    };

    expect(
      resolveEditEmbeddingTargetFeedback({
        source: legacySource,
        originalTarget: resolveEffectiveIngestTarget(legacySource, embeddingOptions),
        nextTarget: 'search',
        coverageEntry: coverage,
        embeddingOptions,
        t,
      }),
    ).toEqual({
      warning: null,
      info: 'crawl.form.embeddingTarget.editInfo.alreadyIndexed:openai / text-embedding-3-small',
    });
  });

  it('shows symmetric mismatch warning when chat and search share the same project model', () => {
    const t = (key: string, options?: Record<string, string>) =>
      `${key}:${options?.indexedModel ?? ''}:${options?.targetModel ?? ''}`;

    const sameModelOptions = {
      search: {
        source: 'search' as const,
        provider: 'openai',
        model: 'text-embedding-3-small',
        collection: 'proj_openai',
      },
      chat: {
        source: 'chat' as const,
        provider: 'openai',
        model: 'text-embedding-3-small',
        collection: 'proj_openai',
      },
      same_collection: true,
      default_target: 'search' as const,
    };

    const legacyMistral = sampleSource({
      ingest_embedding_target: null,
      trained_at: '2026-01-02T00:00:00.000Z',
      is_search_ready: true,
      indexed_embedding_models: [
        { provider: 'mistral', model: 'mistral-embed', collection: 'proj_mistral', source: 'search' },
      ],
    });

    const coverage = {
      id: legacyMistral.id,
      embedded_models: [
        {
          provider: 'mistral',
          model: 'mistral-embed',
          collection: 'proj_mistral',
          is_active: false,
        },
      ],
      missing_active: true,
    };

    const expected = {
      warning:
        'crawl.form.embeddingTarget.editWarning.indexedOtherCollection:mistral / mistral-embed:openai / text-embedding-3-small',
      info: null,
    };

    expect(
      resolveEditEmbeddingTargetFeedback({
        source: legacyMistral,
        originalTarget: 'search',
        nextTarget: 'search',
        coverageEntry: coverage,
        embeddingOptions: sameModelOptions,
        t,
      }),
    ).toEqual(expected);

    expect(
      resolveEditEmbeddingTargetFeedback({
        source: legacyMistral,
        originalTarget: 'search',
        nextTarget: 'chat',
        coverageEntry: coverage,
        embeddingOptions: sameModelOptions,
        t,
      }),
    ).toEqual(expected);
  });

  it('shows mismatch warning for legacy mistral when project search expects openai', () => {
    const t = (key: string, options?: Record<string, string>) =>
      `${key}:${options?.indexedModel ?? ''}:${options?.targetModel ?? ''}`;

    const legacySource = sampleSource({
      ingest_embedding_target: null,
      trained_at: '2026-01-02T00:00:00.000Z',
      is_search_ready: true,
      indexed_embedding_models: [
        { provider: 'mistral', model: 'mistral-embed', collection: 'proj_mistral' },
      ],
    });

    const coverage = {
      id: legacySource.id,
      embedded_models: [
        {
          provider: 'mistral',
          model: 'mistral-embed',
          collection: 'proj_mistral',
          is_active: false,
        },
      ],
      missing_active: true,
    };

    expect(
      resolveEditEmbeddingTargetFeedback({
        source: legacySource,
        originalTarget: null,
        nextTarget: 'search',
        coverageEntry: coverage,
        embeddingOptions,
        t,
      }),
    ).toEqual({
      warning:
        'crawl.form.embeddingTarget.editWarning.indexedOtherCollection:mistral / mistral-embed:openai / text-embedding-3-small',
      info: null,
    });
  });

  it('shows already-indexed edit info for legacy mistral sources', () => {
    const t = (key: string, options?: Record<string, string>) =>
      `${key}:${options?.model ?? ''}`;

    const legacySource = sampleSource({
      ingest_embedding_target: null,
      trained_at: '2026-01-02T00:00:00.000Z',
      indexed_embedding_models: [
        { provider: 'mistral', model: 'mistral-embed', collection: 'proj_mistral' },
      ],
    });

    const coverage = {
      id: legacySource.id,
      embedded_models: [
        {
          provider: 'mistral',
          model: 'mistral-embed',
          collection: 'proj_mistral',
          is_active: false,
        },
      ],
      missing_active: true,
    };

    expect(
      resolveEditEmbeddingTargetFeedback({
        source: legacySource,
        originalTarget: resolveEffectiveIngestTarget(legacySource, embeddingOptions),
        nextTarget: 'chat',
        coverageEntry: coverage,
        embeddingOptions,
        t,
      }),
    ).toEqual({
      warning: null,
      info: 'crawl.form.embeddingTarget.editInfo.alreadyIndexed:mistral / mistral-embed',
    });
  });

  it('suppresses table warning when legacy source is indexed in effective target collection', () => {
    const legacySource = sampleSource({
      ingest_embedding_target: null,
      trained_at: '2026-01-02T00:00:00.000Z',
      indexed_embedding_models: [
        { provider: 'mistral', model: 'mistral-embed', collection: 'proj_mistral' },
      ],
    });

    const coverage = {
      id: legacySource.id,
      embedded_models: [
        {
          provider: 'mistral',
          model: 'mistral-embed',
          collection: 'proj_mistral',
          is_active: false,
        },
      ],
      missing_active: true,
    };

    expect(
      shouldShowCrawlEmbeddingCoverageWarning(legacySource, coverage, embeddingOptions),
    ).toBe(false);
  });

  it('shows mismatch warning for trained legacy source indexed in another collection', () => {
    const t = (key: string, options?: Record<string, string>) =>
      `${key}:${options?.indexedModel ?? ''}:${options?.targetModel ?? ''}`;

    const legacySource = sampleSource({
      ingest_embedding_target: null,
      trained_at: '2026-01-02T00:00:00.000Z',
      is_search_ready: true,
      indexed_embedding_models: [
        { provider: 'openai', model: 'text-embedding-3-small', collection: 'proj_openai' },
      ],
    });

    const coverage = {
      id: legacySource.id,
      embedded_models: [
        {
          provider: 'mistral',
          model: 'mistral-embed',
          collection: 'proj_mistral',
          is_active: true,
        },
      ],
      missing_active: true,
    };

    expect(
      resolveEditEmbeddingTargetFeedback({
        source: legacySource,
        originalTarget: resolveEffectiveIngestTarget(legacySource, embeddingOptions),
        nextTarget: 'search',
        coverageEntry: coverage,
        embeddingOptions,
        t,
      }),
    ).toEqual({
      warning:
        'crawl.form.embeddingTarget.editWarning.indexedOtherCollection:mistral / mistral-embed:openai / text-embedding-3-small',
      info: null,
    });

    expect(
      shouldShowCrawlEmbeddingCoverageWarning(legacySource, coverage, embeddingOptions),
    ).toBe(true);
  });

  it('shows all indexed collections for chat-target source with stale cross-index coverage', () => {
    const source = sampleSource({
      ingest_embedding_target: 'chat',
      trained_at: '2026-01-02T00:00:00.000Z',
      is_search_ready: true,
      indexed_embedding_models: [
        {
          provider: 'openai',
          model: 'text-embedding-3-small',
          collection: 'proj_openai',
          source: 'chat',
        },
      ],
    });

    const labels = resolveCrawlSourceModelLabels(
      source,
      {
        id: source.id,
        embedded_models: [
          {
            provider: 'mistral',
            model: 'mistral-embed',
            collection: 'proj_mistral',
            is_active: false,
          },
        ],
        missing_active: false,
      },
      embeddingOptions,
    );

    expect(labels).toEqual([
      'openai / text-embedding-3-small',
      'mistral / mistral-embed',
    ]);
  });

  it('shows openai edit info for chat-target source when chat is selected', () => {
    const t = (key: string, options?: Record<string, string>) =>
      `${key}:${options?.model ?? ''}:${options?.otherModel ?? ''}`;

    const openAiChatOptions = {
      ...embeddingOptions,
      chat: {
        ...embeddingOptions.chat,
        provider: 'openai',
        model: 'text-embedding-3-small',
        collection: 'proj_openai',
      },
    };

    const source = sampleSource({
      ingest_embedding_target: 'chat',
      trained_at: '2026-01-02T00:00:00.000Z',
      is_search_ready: true,
      indexed_embedding_models: [
        {
          provider: 'openai',
          model: 'text-embedding-3-small',
          collection: 'proj_openai',
          source: 'chat',
        },
      ],
    });

    const coverage = {
      id: source.id,
      embedded_models: [
        {
          provider: 'openai',
          model: 'text-embedding-3-small',
          collection: 'proj_openai',
          is_active: true,
        },
      ],
      missing_active: false,
    };

    expect(
      resolveEditEmbeddingTargetFeedback({
        source,
        originalTarget: 'chat',
        nextTarget: 'chat',
        coverageEntry: coverage,
        embeddingOptions: openAiChatOptions,
        t,
      }),
    ).toEqual({
      warning: null,
      info: 'crawl.form.embeddingTarget.editInfo.alreadyIndexed:openai / text-embedding-3-small:',
    });
  });

  it('warns indexedOtherCollection when chat target selected but vectors are search-only', () => {
    const t = (key: string, options?: Record<string, string>) =>
      `${key}:${options?.indexedModel ?? ''}:${options?.targetModel ?? ''}`;

    const source = sampleSource({
      ingest_embedding_target: 'chat',
      trained_at: '2026-01-02T00:00:00.000Z',
      is_search_ready: true,
      indexed_embedding_models: [],
    });

    expect(
      resolveEditEmbeddingTargetFeedback({
        source,
        originalTarget: 'chat',
        nextTarget: 'chat',
        coverageEntry: {
          id: source.id,
          embedded_models: [
            {
              provider: 'openai',
              model: 'text-embedding-3-small',
              collection: 'proj_openai',
              is_active: false,
            },
          ],
          missing_active: true,
        },
        embeddingOptions,
        t,
      }),
    ).toEqual({
      warning:
        'crawl.form.embeddingTarget.editWarning.indexedOtherCollection:openai / text-embedding-3-small:mistral / mistral-embed',
      info: null,
    });
  });

  it('suppresses switch warning when target models are identical', () => {
    const sameModelOptions = {
      ...embeddingOptions,
      search: {
        ...embeddingOptions.search,
        provider: 'mistral',
        model: 'mistral-embed',
        collection: 'proj_mistral',
      },
      chat: {
        ...embeddingOptions.chat,
        provider: 'mistral',
        model: 'mistral-embed',
        collection: 'proj_mistral',
      },
      same_collection: true,
    };

    const t = () => 'unexpected';

    const source = sampleSource({
      ingest_embedding_target: 'search',
      trained_at: '2026-01-02T00:00:00.000Z',
      is_search_ready: true,
      indexed_embedding_models: [
        { provider: 'mistral', model: 'mistral-embed', collection: 'proj_mistral', source: 'search' },
      ],
    });

    expect(
      resolveEditEmbeddingTargetFeedback({
        source,
        originalTarget: 'search',
        nextTarget: 'chat',
        coverageEntry: {
          id: source.id,
          embedded_models: [
            {
              provider: 'mistral',
              model: 'mistral-embed',
              collection: 'proj_mistral',
              is_active: true,
            },
          ],
          missing_active: false,
        },
        embeddingOptions: sameModelOptions,
        t,
      }),
    ).toEqual({ warning: null, info: null });
  });
});

describe('crawl.utils job error detail', () => {
  it('filters completed success boilerplate from error suffix', () => {
    const { isCrawlSuccessStatusMessage, resolveCrawlJobErrorDetail } = require('@/features/crawl/utils/crawl.utils');

    expect(
      isCrawlSuccessStatusMessage('Crawl and indexing completed successfully.'),
    ).toBe(true);
    expect(
      resolveCrawlJobErrorDetail(
        { status_message: 'Crawl and indexing completed successfully.' },
        'fallback',
      ),
    ).toBe('');
    expect(
      resolveCrawlJobErrorDetail(
        { status_message: 'Indexing failed: invalid API key' },
        'fallback',
      ),
    ).toBe('Indexing failed: invalid API key');
  });
});
