import type { ModelConfigurationResponse } from '@/features/model-configuration/types/model-configuration.types';
import {
  buildProviderDraft,
  buildProviderSavePayload,
  buildProviderTestPayload,
  CHAT_MODEL_REQUIRED_ERROR,
  mapModelConfigurationResponse,
  toLegacyProviderKey,
  toModelProviderKey,
} from '@/features/model-configuration/utils/model-configuration.mappers';
import { DEFAULT_TEMPERATURE } from '@/features/model-configuration/utils/provider-surface-tuning';

const TYPED_KEY = 'sk-test-abcdefghijklmnopqrstuvwxyz';

const RESPONSE: ModelConfigurationResponse = {
  configured_count: 1,
  providers: [
    {
      provider: 'Custom LLM / Ollama',
      value: 'ollama',
      chat_models: [{ name: 'Llama 3 8B', value: 'llama3:8b' }],
      embedding_models: [{ name: 'Jina v2', value: 'jina/jina-embeddings-v2-base-en' }],
      config: { provider: 'ollama', configured: false },
    },
    {
      provider: 'OpenAI',
      value: 'openai',
      chat_models: [{ name: 'GPT-4o', value: 'gpt-4o' }],
      embedding_models: [{ name: 'text-embedding-3-small', value: 'text-embedding-3-small' }],
      config: {
        provider: 'openai',
        configured: true,
        has_api_key: true,
        api_key_masked: 'sk-t...wxyz',
        chat_model: 'gpt-4.1',
        embedding_model: 'text-embedding-3-small',
        temperature: '0.3',
        surfaces: {
          chat: { temperature: '0.3', similarity_threshold: 0.35, max_tokens: 900 },
          search: { temperature: '0.8', similarity_threshold: null, max_tokens: 1500 },
        },
        last_test_status: 'success',
      },
    },
    {
      provider: 'Anthropic',
      value: 'anthropic',
      chat_models: [{ name: 'Claude Sonnet 5', value: 'claude-sonnet-5' }],
      embedding_models: [{ name: 'should be ignored', value: 'x' }],
      config: {
        provider: 'anthropic',
        configured: false,
        has_api_key: true,
        key_rejected: true,
        chat_model: 'claude-sonnet-5',
        last_test_status: 'failed',
      },
    },
  ],
};

describe('model-configuration mappers', () => {
  const bundle = mapModelConfigurationResponse(RESPONSE);
  const openai = bundle.providers.find((p) => p.key === 'openai')!;
  const anthropic = bundle.providers.find((p) => p.key === 'anthropic')!;

  it('orders providers and keeps the configured count', () => {
    expect(bundle.providers.map((p) => p.key)).toEqual(['openai', 'anthropic', 'ollama']);
    expect(bundle.configuredCount).toBe(1);
  });

  it('maps saved config with per-surface tuning and no plaintext key', () => {
    expect(openai.config).toMatchObject({
      configured: true,
      hasApiKey: true,
      apiKeyMasked: 'sk-t...wxyz',
      chatModel: 'gpt-4.1',
      surfaces: {
        chat: { temperature: 0.3, similarityThreshold: 0.35, maxTokens: 900 },
        search: { temperature: 0.8, similarityThreshold: null, maxTokens: 1500 },
      },
      lastTestStatus: 'success',
    });
  });

  it('maps a rejected stored key as not configured', () => {
    expect(openai.config.keyRejected).toBe(false);
    expect(anthropic.config).toMatchObject({ configured: false, hasApiKey: true, keyRejected: true });
  });

  it('drops embedding models for chat-only providers', () => {
    expect(anthropic.embeddingModels).toEqual([]);
    expect(buildProviderDraft(anthropic).embeddingModel).toBe('');
  });

  it('seeds a draft with the masked saved key and per-surface tuning', () => {
    const draft = buildProviderDraft(openai);
    expect(draft.apiKey).toBe('sk-t********wxyz');
    expect(draft.chatModel).toBe('gpt-4.1');
    expect(draft.surfaces).toEqual({
      chat: { temperature: 0.3, similarityThreshold: 0.35, maxTokens: 900 },
      search: { temperature: 0.8, similarityThreshold: 0.5, maxTokens: 1500 },
    });
    expect(buildProviderDraft(anthropic).surfaces.chat.temperature).toBe(DEFAULT_TEMPERATURE);
  });

  it('omits api_key on save when the saved key is untouched', () => {
    const { payload, error } = buildProviderSavePayload({
      provider: 'openai',
      draft: buildProviderDraft(openai),
      pendingPlaintextKey: '',
      hasSavedKey: true,
      apiKeyEditing: false,
    });
    expect(error).toBeUndefined();
    expect(payload).not.toHaveProperty('api_key');
    expect(payload).toEqual({
      chat_model: 'gpt-4.1',
      embedding_model: 'text-embedding-3-small',
      chat_temperature: 0.3,
      search_temperature: 0.8,
      chat_similarity_threshold: 0.35,
      search_similarity_threshold: 0.5,
      chat_max_tokens: 900,
      search_max_tokens: 1500,
    });
  });

  it('sends a newly typed key and requires one when nothing is saved', () => {
    const draft = { ...buildProviderDraft(anthropic), apiKey: TYPED_KEY };
    const typed = buildProviderSavePayload({
      provider: 'anthropic',
      draft,
      pendingPlaintextKey: TYPED_KEY,
      hasSavedKey: false,
      apiKeyEditing: true,
    });
    expect(typed.payload).toMatchObject({ api_key: TYPED_KEY, embedding_model: null });

    const missing = buildProviderSavePayload({
      provider: 'anthropic',
      draft: buildProviderDraft(anthropic),
      pendingPlaintextKey: '',
      hasSavedKey: false,
      apiKeyEditing: false,
    });
    expect(missing.error).toBeTruthy();
  });

  it('requires a chat model', () => {
    const { error } = buildProviderSavePayload({
      provider: 'ollama',
      draft: { ...buildProviderDraft(bundle.providers[2]), chatModel: '' },
      pendingPlaintextKey: '',
      hasSavedKey: false,
      apiKeyEditing: false,
    });
    expect(error).toBe(CHAT_MODEL_REQUIRED_ERROR);
  });

  it('tests with the stored key unless a new key was typed', () => {
    const draft = buildProviderDraft(openai);
    expect(buildProviderTestPayload('openai', draft, '')).not.toHaveProperty('api_key');
    expect(buildProviderTestPayload('openai', { ...draft, apiKey: TYPED_KEY }, TYPED_KEY).api_key).toBe(TYPED_KEY);
  });

  it('normalizes provider aliases', () => {
    expect(toModelProviderKey('google-gemini')).toBe('gemini');
    expect(toModelProviderKey('custom-llm')).toBe('ollama');
    expect(toModelProviderKey('cohere')).toBeNull();
    expect(toLegacyProviderKey('gemini')).toBe('google-gemini');
  });
});
