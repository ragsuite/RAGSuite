import type { CrawlEmbeddingTargetOptions, CrawlSource } from '@/features/crawl/types/crawl.types';
import { mapApiEmbeddingTargetOptions } from '@/features/crawl/utils/crawl-api-mappers';
import {
  isEmbeddingDestinationPending,
  projectTargetCollection,
  resolvePersistedIngestTarget,
} from '@/features/crawl/utils/crawl-embedding-display';
import {
  isProviderIngestTarget,
  providerDisplayLabel,
  resolveEditProviderSelection,
  resolveSourceProviderUnavailable,
  surfaceForProviderTarget,
} from '@/features/crawl/utils/crawl-provider-target';
import {
  providerUsedByKey,
  resolveEditProviderPreselection,
  resolveSourceEmbeddingMessages,
} from '@/features/crawl/utils/crawl-source-embedding-form';

const t = (key: string, options?: Record<string, string>) =>
  options ? `${key}:${Object.values(options).join('|')}` : key;

function sampleSource(overrides: Partial<CrawlSource> = {}): CrawlSource {
  return {
    id: 'source-1',
    name: 'Example',
    source_type: 'domain',
    base_url: 'https://example.com',
    depth: 2,
    cadence: 'ONCE',
    headless_mode: 'OFF',
    allowlist: [],
    denylist: [],
    skip_header_footer: true,
    index_site_header: false,
    index_site_footer: false,
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

const options: CrawlEmbeddingTargetOptions = {
  search: { source: 'search', provider: 'mistral', model: 'mistral-embed', collection: 'proj_mistral' },
  chat: {
    source: 'chat',
    provider: 'ollama',
    model: 'jina/jina-embeddings-v2-base-de',
    collection: 'proj_ollama',
  },
  same_collection: false,
  default_target: 'search',
  providers: [
    { provider: 'mistral', label: 'Mistral', model: 'mistral-embed', collection: 'proj_mistral', used_by: ['search'] },
    {
      provider: 'ollama',
      label: 'Custom LLM / Ollama',
      model: 'jina/jina-embeddings-v2-base-de',
      collection: 'proj_ollama',
      used_by: ['chat'],
    },
    { provider: 'gemini', label: 'Google Gemini', model: 'text-embedding-004', collection: 'proj_gemini', used_by: [] },
  ],
  default_provider: 'mistral',
  provider_labels: { openai: 'OpenAI', mistral: 'Mistral', gemini: 'Google Gemini', ollama: 'Custom LLM / Ollama' },
};

describe('mapApiEmbeddingTargetOptions providers', () => {
  it('maps configured providers and drops invalid rows', () => {
    const mapped = mapApiEmbeddingTargetOptions({
      search: options.search,
      chat: options.chat,
      same_collection: false,
      default_target: 'search',
      providers: [
        { provider: 'mistral', label: 'Mistral', model: 'mistral-embed', collection: 'proj_mistral', used_by: ['search', 'x'] },
        { provider: 'anthropic', label: 'Anthropic', model: 'none', collection: 'c' },
        { provider: 'gemini', model: '', collection: 'c' },
      ],
      default_provider: 'mistral',
      provider_labels: { openai: 'OpenAI', anthropic: 'Anthropic' },
    });
    expect(mapped?.providers).toEqual([
      { provider: 'mistral', label: 'Mistral', model: 'mistral-embed', collection: 'proj_mistral', used_by: ['search'] },
    ]);
    expect(mapped?.default_provider).toBe('mistral');
    expect(mapped?.provider_labels).toEqual({ openai: 'OpenAI' });
  });

  it('defaults to an empty list for older API responses', () => {
    const mapped = mapApiEmbeddingTargetOptions({
      search: options.search,
      chat: options.chat,
      same_collection: false,
      default_target: 'search',
      default_provider: 'openai',
    });
    expect(mapped?.providers).toEqual([]);
    expect(mapped?.default_provider).toBeNull();
  });
});

describe('crawl-provider-target', () => {
  it('recognises provider keys only', () => {
    expect(isProviderIngestTarget('mistral')).toBe(true);
    expect(isProviderIngestTarget('search')).toBe(false);
    expect(isProviderIngestTarget('anthropic')).toBe(false);
  });

  it('maps provider targets to the widget surface using its collection', () => {
    expect(surfaceForProviderTarget('mistral', options)).toBe('search');
    expect(surfaceForProviderTarget('ollama', options)).toBe('chat');
    expect(surfaceForProviderTarget('gemini', options)).toBeNull();
    expect(projectTargetCollection('ollama', options)).toBe('proj_ollama');
  });

  it('flags a stored provider that is no longer configured', () => {
    expect(resolveSourceProviderUnavailable(sampleSource({ ingest_embedding_target: 'openai' }), options)).toBe(true);
    expect(resolveSourceProviderUnavailable(sampleSource({ ingest_embedding_target: 'mistral' }), options)).toBe(false);
    expect(resolveSourceProviderUnavailable(sampleSource({ ingest_embedding_target: 'search' }), options)).toBe(false);
    expect(providerDisplayLabel('openai', options)).toBe('OpenAI');
  });

  it('preselects the stored provider or the legacy destination provider', () => {
    expect(resolveEditProviderSelection(sampleSource({ ingest_embedding_target: 'ollama' }), null, options)).toBe('ollama');
    expect(resolveEditProviderSelection(sampleSource({ ingest_embedding_target: 'openai' }), null, options)).toBeNull();
    expect(resolveEditProviderPreselection(sampleSource({ ingest_embedding_target: 'chat' }), null, options)).toBe('ollama');
    expect(resolveEditProviderPreselection(sampleSource({ ingest_embedding_target: 'search' }), null, options)).toBe(
      'mistral',
    );
  });

  it('treats a provider target as the persisted destination', () => {
    const source = sampleSource({ ingest_embedding_target: 'mistral' });
    expect(resolvePersistedIngestTarget(source, options)).toBe('mistral');
    expect(isEmbeddingDestinationPending(source, null, options)).toBe(true);
    expect(
      isEmbeddingDestinationPending(
        source,
        {
          item_id: source.id,
          embedded_models: [{ provider: 'mistral', model: 'mistral-embed', collection: 'proj_mistral' }],
        } as never,
        options,
      ),
    ).toBe(false);
  });
});

describe('crawl-source-embedding-form', () => {
  it('builds the used-by hint key', () => {
    expect(providerUsedByKey(['search', 'chat'])).toBe('crawl.form.embeddingTarget.usedBy.both');
    expect(providerUsedByKey(['chat'])).toBe('crawl.form.embeddingTarget.usedBy.chat');
    expect(providerUsedByKey([])).toBe('crawl.form.embeddingTarget.usedBy.none');
  });

  it('add mode: notice for the selected provider and a warning when no widget uses it', () => {
    expect(resolveSourceEmbeddingMessages({ mode: 'add', selected: 'mistral', options, t })).toEqual({
      info: 'crawl.form.embeddingTarget.providerNotice:Mistral / mistral-embed',
      warning: null,
    });
    expect(resolveSourceEmbeddingMessages({ mode: 'add', selected: 'gemini', options, t }).warning).toBe(
      'crawl.form.embeddingTarget.unusedWarning:Google Gemini',
    );
  });

  it('edit mode: paused provider warning when nothing is selected', () => {
    const source = sampleSource({ ingest_embedding_target: 'openai' });
    expect(resolveSourceEmbeddingMessages({ mode: 'edit', source, selected: undefined, options, t })).toEqual({
      info: null,
      warning: 'crawl.form.embeddingTarget.providerUnavailable:OpenAI',
    });
  });

  it('edit mode: legacy destination outside configured providers is explained', () => {
    const legacyOptions: CrawlEmbeddingTargetOptions = {
      ...options,
      search: { source: 'search', provider: 'openai', model: 'text-embedding-3-small', collection: 'proj_openai' },
    };
    const source = sampleSource({ ingest_embedding_target: 'search' });
    expect(
      resolveSourceEmbeddingMessages({ mode: 'edit', source, selected: undefined, options: legacyOptions, t }).info,
    ).toBe('crawl.form.embeddingTarget.legacyUnmatched:OpenAI / text-embedding-3-small');
  });

  it('edit mode: picking a provider on the same collection as a legacy target is not a model switch', () => {
    const source = sampleSource({ ingest_embedding_target: 'search', trained_at: '2026-01-02T00:00:00Z' });
    const coverage = {
      item_id: source.id,
      embedded_models: [{ provider: 'mistral', model: 'mistral-embed', collection: 'proj_mistral' }],
    } as never;
    const messages = resolveSourceEmbeddingMessages({
      mode: 'edit',
      source,
      selected: 'mistral',
      coverageEntry: coverage,
      options,
      t,
    });
    expect(messages.warning).toBeNull();
    expect(messages.info).toBe('crawl.form.embeddingTarget.editInfo.alreadyIndexed:Mistral / mistral-embed');
  });
});
