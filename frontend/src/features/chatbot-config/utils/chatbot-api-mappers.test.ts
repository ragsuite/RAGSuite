import type { ModelSettings } from '@/features/chatbot-config/types/chatbot-config.types';
import {
  mapSettingsToConfigModelsUpdate,
  parseConfigModelsBody,
} from '@/features/chatbot-config/utils/chatbot-api-mappers';

const CURRENT: ModelSettings = {
  provider: 'openai',
  chatModel: 'gpt-4.1-mini',
  embeddingModel: 'text-embedding-3-small',
  apiKey: '',
  apiKeyMasked: '',
  providerApiKeys: {},
  temperature: 0.3,
  maxTokens: 1000,
  topP: 0.95,
  bestOf: 1,
  frequencyPenalty: 0,
  presencePenalty: 0,
  topKResults: 8,
  similarityThreshold: 0.45,
  useReranker: true,
  rerankCandidates: null,
  thresholdPreset: null,
  keywordBlend: null,
  promptTemplate: null,
  systemPrompt: '',
};

describe('chatbot retrieve knobs mappers', () => {
  it('keeps rerank candidates and threshold preset on parse', () => {
    const parsed = parseConfigModelsBody({
      data: {
        model_provider: 'openai',
        embedding_model: 'text-embedding-3-small',
        chat_top_k: 4,
        chat_rerank_candidates: 32,
        chat_threshold_preset: 'broad',
        chat_similarity_threshold: 0.25,
      },
    });
    expect(parsed).toMatchObject({
      chat_top_k: 4,
      chat_rerank_candidates: 32,
      chat_threshold_preset: 'broad',
      chat_similarity_threshold: 0.25,
    });
  });

  it('always sends retrieve knobs on save', () => {
    const body = mapSettingsToConfigModelsUpdate(CURRENT);
    expect(body.chat_top_k).toBe(8);
    expect(body.chat_rerank_candidates).toBe(64);
    expect(body.chat_threshold_preset).toBe('balanced');
    expect(body.chat_keyword_blend).toBeNull();
    expect(body.chat_similarity_threshold).toBe(0.45);

    const custom = mapSettingsToConfigModelsUpdate({
      ...CURRENT,
      topKResults: 4,
      rerankCandidates: 32,
      thresholdPreset: 'broad',
      similarityThreshold: 0.25,
    });
    expect(custom).toMatchObject({
      chat_top_k: 4,
      chat_rerank_candidates: 32,
      chat_threshold_preset: 'broad',
      chat_similarity_threshold: 0.25,
    });
  });
});
