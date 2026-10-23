import type { ProviderCatalogEntry } from '@/features/model-configuration/types/model-configuration.types';
import { mapProviderConfig } from '@/features/model-configuration/utils/model-configuration.mappers';
import {
  countProvidersByKind,
  providerHasKind,
  providerMatchesQuery,
  resolveExtraModelOptions,
} from '@/features/model-configuration/utils/provider-catalog';

function entry(
  key: string,
  kinds: ProviderCatalogEntry['kinds'],
  extras: Partial<ProviderCatalogEntry> = {},
): ProviderCatalogEntry {
  return {
    key,
    label: key,
    kinds,
    chatModels: extras.chatModels ?? [],
    embeddingModels: extras.embeddingModels ?? [],
    asrModels: extras.asrModels ?? [],
    ttsModels: extras.ttsModels ?? [],
    rerankModels: extras.rerankModels ?? [],
    ocrModels: extras.ocrModels ?? [],
    config: mapProviderConfig({ provider: key, configured: false }, key),
    ...extras,
  };
}

describe('provider catalog helpers', () => {
  const providers = [
    entry('openai', ['chat', 'embedding', 'asr', 'tts'], {
      chatModels: [{ key: 'gpt-4o', label: 'GPT-4o' }],
      asrModels: [{ key: 'whisper-1', label: 'whisper-1' }],
    }),
    entry('cohere', ['rerank'], {
      rerankModels: [{ key: 'rerank-v3.5', label: 'rerank-v3.5' }],
    }),
    entry('anthropic', ['chat']),
  ];

  it('counts providers per kind without changing on search', () => {
    expect(countProvidersByKind(providers)).toEqual({
      all: 3,
      chat: 2,
      embedding: 1,
      asr: 1,
      rerank: 1,
      tts: 1,
      ocr: 0,
    });
  });

  it('chip counts follow the search hits, not the full catalog', () => {
    const catalog = [
      entry('mistral', ['chat', 'embedding'], { label: 'Mistral' }),
      entry('mistral_ocr', ['ocr'], { label: 'Mistral OCR' }),
      entry('openai', ['chat', 'embedding', 'asr', 'tts'], { label: 'OpenAI' }),
    ];
    const hits = catalog.filter((item) => providerMatchesQuery(item, 'mistral'));
    expect(hits.map((item) => item.key)).toEqual(['mistral', 'mistral_ocr']);
    expect(countProvidersByKind(hits)).toEqual({
      all: 2,
      chat: 1,
      embedding: 1,
      asr: 0,
      rerank: 0,
      tts: 0,
      ocr: 1,
    });
  });

  it('filters by kind and matches search against model ids', () => {
    expect(providers.filter((item) => providerHasKind(item, 'rerank')).map((item) => item.key)).toEqual([
      'cohere',
    ]);
    expect(providerMatchesQuery(providers[0], 'whisper-1')).toBe(true);
    expect(providerMatchesQuery(providers[0], 'gpt-4o')).toBe(true);
    expect(providerMatchesQuery(providers[0], 'rerank-v3.5')).toBe(false);
    expect(providerMatchesQuery(providers[1], 'Cohere')).toBe(true);
  });

  it('matches openai by leading name, not Azure or aggregator model ids', () => {
    const openai = entry('openai', ['chat'], { label: 'OpenAI' });
    const azure = entry('azure_openai', ['chat'], { label: 'Azure OpenAI' });
    const aggregator = entry('deepinfra', ['chat'], {
      label: 'DeepInfra',
      chatModels: [{ key: 'openai/gpt-4o', label: 'openai/gpt-4o' }],
    });
    const compat = entry('openai_compatible', ['chat'], { label: 'OpenAI-API-Compatible' });
    expect(providerMatchesQuery(openai, 'openai')).toBe(true);
    expect(providerMatchesQuery(compat, 'openai')).toBe(true);
    expect(providerMatchesQuery(azure, 'openai')).toBe(false);
    expect(providerMatchesQuery(azure, 'azure')).toBe(true);
    expect(providerMatchesQuery(aggregator, 'openai')).toBe(false);
    expect(providerMatchesQuery(aggregator, 'gpt-4o')).toBe(true);
  });

  it('prepends native default and keeps a saved extra model', () => {
    const options = resolveExtraModelOptions(providers[0], 'asr', 'whisper-1', 'RAGSuite native (default)');
    expect(options[0]).toEqual({ key: '', label: 'RAGSuite native (default)' });
    expect(options.some((item) => item.key === 'whisper-1')).toBe(true);
  });
});
