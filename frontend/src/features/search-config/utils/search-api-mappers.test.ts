import type { ModelSettings } from '@/features/search-config/types/search-config.types';
import { mapSearchModelConfigToSettings } from '@/features/search-config/utils/search-api-mappers';

const CURRENT: ModelSettings = {
  provider: 'ollama',
  chatModel: '',
  embeddingModel: '',
  apiKey: '',
  apiKeyMasked: '',
  providerApiKeys: {},
  temperature: 0.7,
  maxTokens: 2000,
  topP: 0.01,
  bestOf: 1,
  frequencyPenalty: 0.01,
  presencePenalty: 0.01,
  topKResults: 5,
  similarityThreshold: 0.5,
  useReranker: true,
  systemPrompt: '',
};

describe('mapSearchModelConfigToSettings', () => {
  it('reads string-stored generation params', () => {
    const mapped = mapSearchModelConfigToSettings(
      { data: { model_provider: 'mistral', search_temperature: '0.3', search_top_p: '0.95' } },
      CURRENT,
    );
    expect(mapped).toMatchObject({ provider: 'mistral', temperature: 0.3, topP: 0.95 });
  });

  it('keeps the current value for missing or non-numeric params', () => {
    const mapped = mapSearchModelConfigToSettings(
      { data: { model_provider: 'mistral', search_temperature: null, search_top_p: 'abc' } },
      CURRENT,
    );
    expect(mapped).toMatchObject({ temperature: 0.7, topP: 0.01 });
  });
});
