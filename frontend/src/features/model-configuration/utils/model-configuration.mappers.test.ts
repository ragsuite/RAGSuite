import type { ModelConfigurationResponse } from '@/features/model-configuration/types/model-configuration.types';
import {
  buildProviderDraft,
  buildProviderSavePayload,
  buildProviderTestPayload,
  CHAT_MODEL_REQUIRED_ERROR,
  ENDPOINT_REQUIRED_ERROR,
  TEST_CREDENTIALS_REQUIRED_ERROR,
  TEST_NO_KEY_ERROR,
  TEST_NO_KIND_MODEL_ERROR,
  TEST_NO_MODEL_ERROR,
  applyAzureDeploymentLists,
  formatAzureDeploymentsRefreshError,
  mapAzureDeploymentsListResult,
  mapModelConfigurationResponse,
  pickAzureDeploymentNames,
  resolveAzureDeploymentsRefreshMessage,
  toLegacyProviderKey,
  toModelProviderKey,
} from '@/features/model-configuration/utils/model-configuration.mappers';
import type { ProviderCatalogEntry } from '@/features/model-configuration/types/model-configuration.types';
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
    expect(anthropic.kinds).toEqual(['chat']);
    expect(openai.kinds).toContain('embedding');
  });

  it('maps extra speech/rerank/ocr fields and serializes empty as native', () => {
    expect(openai.config).toMatchObject({ asrModel: '', ttsModel: '', rerankModel: '', ocrModel: '' });
    const draft = {
      ...buildProviderDraft(openai),
      asrModel: 'whisper-1',
      ttsModel: '',
      rerankModel: 'rerank-v3.5',
      ocrModel: '  ',
    };
    const { payload } = buildProviderSavePayload({
      provider: 'openai',
      draft,
      pendingPlaintextKey: '',
      hasSavedKey: true,
      apiKeyEditing: false,
    });
    expect(payload).toMatchObject({
      asr_model: 'whisper-1',
      tts_model: null,
      rerank_model: 'rerank-v3.5',
      ocr_model: null,
    });
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
      asr_model: null,
      tts_model: null,
      rerank_model: null,
      ocr_model: null,
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
    const stored = buildProviderTestPayload({
      provider: 'openai',
      draft,
      pendingPlaintextKey: '',
      hasSavedKey: true,
    });
    expect(stored.error).toBeUndefined();
    expect(stored.payload).not.toHaveProperty('api_key');

    const typed = buildProviderTestPayload({
      provider: 'openai',
      draft: { ...draft, apiKey: TYPED_KEY },
      pendingPlaintextKey: TYPED_KEY,
      hasSavedKey: true,
    });
    expect(typed.payload?.api_key).toBe(TYPED_KEY);
  });

  it('rejects OpenAI test when API key and saved key are both missing', () => {
    const draft = { ...buildProviderDraft(openai), apiKey: '' };
    const { error, payload } = buildProviderTestPayload({
      provider: 'openai',
      draft,
      pendingPlaintextKey: '',
      hasSavedKey: false,
    });
    expect(error).toBe(TEST_NO_KEY_ERROR);
    expect(payload).toBeUndefined();
  });

  it('rejects OpenAI test when chat model is blank', () => {
    const draft = { ...buildProviderDraft(openai), chatModel: '   ' };
    const { error } = buildProviderTestPayload({
      provider: 'openai',
      draft,
      pendingPlaintextKey: '',
      hasSavedKey: true,
    });
    expect(error).toBe(TEST_NO_MODEL_ERROR);
  });

  describe('Azure Test connection validation', () => {
    const emptyAzure = (): ProviderCatalogEntry => ({
      key: 'azure_openai',
      label: 'Azure',
      chatModels: [],
      embeddingModels: [],
      asrModels: [],
      ttsModels: [],
      rerankModels: [],
      ocrModels: [],
      config: {
        provider: 'azure_openai',
        configured: false,
        hasApiKey: false,
        keyRejected: false,
        apiKeyMasked: '',
        chatModel: '',
        embeddingModel: '',
        asrModel: '',
        ttsModel: '',
        rerankModel: '',
        ocrModel: '',
        endpoint: '',
        apiVersion: '',
        surfaces: {
          chat: { temperature: null, similarityThreshold: null, maxTokens: null },
          search: { temperature: null, similarityThreshold: null, maxTokens: null },
        },
        lastTestStatus: null,
        lastTestedAt: null,
      },
    });

    it('rejects when endpoint and API key are both blank', () => {
      const draft = buildProviderDraft(emptyAzure());
      const { error, payload } = buildProviderTestPayload({
        provider: 'azure_openai',
        draft,
        pendingPlaintextKey: '',
        hasSavedKey: false,
      });
      expect(error).toBe(TEST_CREDENTIALS_REQUIRED_ERROR);
      expect(payload).toBeUndefined();
    });

    it('rejects when only endpoint is blank', () => {
      const draft = {
        ...buildProviderDraft(emptyAzure()),
        apiKey: TYPED_KEY,
        chatModel: 'gpt-4o',
      };
      const { error } = buildProviderTestPayload({
        provider: 'azure_openai',
        draft,
        pendingPlaintextKey: TYPED_KEY,
        hasSavedKey: false,
      });
      expect(error).toBe(ENDPOINT_REQUIRED_ERROR);
    });

    it('rejects when only API key is blank', () => {
      const draft = {
        ...buildProviderDraft(emptyAzure()),
        endpoint: 'https://example.openai.azure.com',
        chatModel: 'gpt-4o',
      };
      const { error } = buildProviderTestPayload({
        provider: 'azure_openai',
        draft,
        pendingPlaintextKey: '',
        hasSavedKey: false,
      });
      expect(error).toBe(TEST_NO_KEY_ERROR);
    });

    it('rejects when credentials are present but chat deployment is blank', () => {
      const draft = {
        ...buildProviderDraft(emptyAzure()),
        endpoint: 'https://example.openai.azure.com',
        apiKey: TYPED_KEY,
        chatModel: '',
      };
      const { error } = buildProviderTestPayload({
        provider: 'azure_openai',
        draft,
        pendingPlaintextKey: TYPED_KEY,
        hasSavedKey: false,
      });
      expect(error).toBe(TEST_NO_MODEL_ERROR);
    });

    it('builds a trimmed Azure test payload when all required fields are set', () => {
      const draft = {
        ...buildProviderDraft(emptyAzure()),
        endpoint: 'https://example.openai.azure.com/',
        apiKey: TYPED_KEY,
        apiVersion: '2024-12-01-preview',
        chatModel: ' gpt-4o ',
        embeddingModel: 'text-embedding-3-small',
      };
      const { payload, error } = buildProviderTestPayload({
        provider: 'azure_openai',
        draft,
        pendingPlaintextKey: TYPED_KEY,
        hasSavedKey: false,
      });
      expect(error).toBeUndefined();
      expect(payload).toEqual({
        chat_model: 'gpt-4o',
        embedding_model: 'text-embedding-3-small',
        asr_model: null,
        tts_model: null,
        rerank_model: null,
        ocr_model: null,
        api_key: TYPED_KEY,
        endpoint: 'https://example.openai.azure.com',
        api_version: '2024-12-01-preview',
      });
    });

    it('allows Azure test with a stored key and no plaintext key', () => {
      const draft = {
        ...buildProviderDraft(emptyAzure()),
        endpoint: 'https://example.openai.azure.com',
        apiKey: 'sk-t...wxyz',
        chatModel: 'gpt-4o',
        embeddingModel: 'text-embedding-3-small',
      };
      const { payload, error } = buildProviderTestPayload({
        provider: 'azure_openai',
        draft,
        pendingPlaintextKey: '',
        hasSavedKey: true,
      });
      expect(error).toBeUndefined();
      expect(payload).toMatchObject({
        chat_model: 'gpt-4o',
        endpoint: 'https://example.openai.azure.com',
      });
      expect(payload).not.toHaveProperty('api_key');
    });
  });

  it('normalizes provider aliases', () => {
    expect(toModelProviderKey('google-gemini')).toBe('gemini');
    expect(toModelProviderKey('google_gemini')).toBe('gemini');
    expect(toModelProviderKey('google_cloud')).not.toBe('gemini');
    expect(toModelProviderKey('custom-llm')).toBe('ollama');
    expect(toModelProviderKey('azure_openai')).toBe('azure_openai');
    expect(toModelProviderKey('Azure OpenAI')).toBe('azure_openai');
    expect(toModelProviderKey('cohere')).toBe('cohere');
    expect(toModelProviderKey('together')).toBe('together');
    expect(toModelProviderKey('openai_compatible')).toBe('openai_compatible');
    expect(toLegacyProviderKey('gemini')).toBe('google-gemini');
  });

  it('maps marketplace adapters, hides embedding for chat-only, and saves optional base URL', () => {
    const raw: ModelConfigurationResponse = {
      configured_count: 0,
      providers: [
        {
          provider: 'Groq',
          value: 'groq',
          adapter: 'openai_compatible',
          kinds: ['chat'],
          default_base_url: 'https://api.groq.com/openai/v1',
          chat_models: [{ name: 'llama', value: 'llama-3.3-70b-versatile' }],
          config: { provider: 'groq', configured: false },
        },
        {
          provider: 'Together AI',
          value: 'together',
          adapter: 'openai_compatible',
          kinds: ['chat', 'embedding'],
          default_base_url: 'https://api.together.xyz/v1',
          chat_models: [{ name: 'llama', value: 'meta-llama/Llama-3.3-70B-Instruct-Turbo' }],
          embedding_models: [{ name: 'm2', value: 'togethercomputer/m2-bert-80M-8k-retrieval' }],
          config: { provider: 'together', configured: false },
        },
      ],
    };
    const mapped = mapModelConfigurationResponse(raw);
    const groq = mapped.providers.find((p) => p.key === 'groq')!;
    const together = mapped.providers.find((p) => p.key === 'together')!;
    expect(groq.adapter).toBe('openai_compatible');
    expect(groq.kinds).toEqual(['chat']);
    expect(groq.embeddingModels).toEqual([]);
    expect(together.kinds).toContain('embedding');
    expect(together.embeddingModels.length).toBeGreaterThan(0);

    const groqSave = buildProviderSavePayload({
      provider: 'groq',
      draft: { ...buildProviderDraft(groq), apiKey: TYPED_KEY, embeddingModel: 'should-drop' },
      pendingPlaintextKey: TYPED_KEY,
      hasSavedKey: false,
      apiKeyEditing: true,
      chatOnly: true,
      adapter: 'openai_compatible',
    });
    expect(groqSave.payload?.embedding_model).toBeNull();
    expect(groqSave.payload).not.toHaveProperty('endpoint');

    const togetherSave = buildProviderSavePayload({
      provider: 'together',
      draft: {
        ...buildProviderDraft(together),
        apiKey: TYPED_KEY,
        endpoint: 'https://api.together.xyz/v1',
      },
      pendingPlaintextKey: TYPED_KEY,
      hasSavedKey: false,
      apiKeyEditing: true,
      adapter: 'openai_compatible',
    });
    expect(togetherSave.payload?.endpoint).toBe('https://api.together.xyz/v1');
    expect(togetherSave.payload?.embedding_model).toBeTruthy();
  });

  it('builds Azure draft without curated OpenAI defaults and includes api_version on save', () => {
    const azureEntry = {
      key: 'azure_openai' as const,
      label: 'Azure',
      chatModels: [],
      embeddingModels: [],
      asrModels: [],
      ttsModels: [],
      rerankModels: [],
      ocrModels: [],
      config: {
        provider: 'azure_openai' as const,
        configured: false,
        hasApiKey: false,
        keyRejected: false,
        apiKeyMasked: '',
        chatModel: '',
        embeddingModel: '',
        asrModel: '',
        ttsModel: '',
        rerankModel: '',
        ocrModel: '',
        endpoint: '',
        apiVersion: '',
        surfaces: {
          chat: { temperature: null, similarityThreshold: null, maxTokens: null },
          search: { temperature: null, similarityThreshold: null, maxTokens: null },
        },
        lastTestStatus: null,
        lastTestedAt: null,
      },
    };
    const draft = buildProviderDraft(azureEntry);
    expect(draft.chatModel).toBe('');
    expect(draft.embeddingModel).toBe('');
    draft.chatModel = 'gpt-4o';
    draft.embeddingModel = 'text-embedding-3-small';
    draft.endpoint = 'https://example.cognitiveservices.azure.com/';
    draft.apiVersion = '2024-12-01-preview';
    draft.apiKey = TYPED_KEY;
    const { payload, error } = buildProviderSavePayload({
      provider: 'azure_openai',
      draft,
      pendingPlaintextKey: TYPED_KEY,
      hasSavedKey: false,
      apiKeyEditing: true,
    });
    expect(error).toBeUndefined();
    expect(payload?.endpoint).toBe('https://example.cognitiveservices.azure.com');
    expect(payload?.api_version).toBe('2024-12-01-preview');
    expect(payload?.chat_model).toBe('gpt-4o');
  });

  it('maps Azure deployments list payloads and picks first names', () => {
    expect(
      mapAzureDeploymentsListResult({
        chat: ['gpt-4o', 'gpt-4o-mini'],
        embedding: ['text-embedding-3-small'],
        error: null,
      }),
    ).toEqual({
      chat: ['gpt-4o', 'gpt-4o-mini'],
      embedding: ['text-embedding-3-small'],
      error: null,
    });
    expect(
      mapAzureDeploymentsListResult({
        data: { chat: [' gpt-4o '], embedding: [], error: '  listing failed  ' },
      }),
    ).toEqual({
      chat: ['gpt-4o'],
      embedding: [],
      error: 'listing failed',
    });
    expect(
      pickAzureDeploymentNames({
        chat: ['gpt-4o', 'gpt-4o-mini'],
        embedding: ['text-embedding-3-small'],
        error: null,
      }),
    ).toEqual({ chatModel: 'gpt-4o', embeddingModel: 'text-embedding-3-small' });
    expect(pickAzureDeploymentNames({ chat: [], embedding: [], error: 'none' })).toBeNull();
  });

  it('applies Azure deployment policy C and builds separate field options', () => {
    expect(
      applyAzureDeploymentLists({
        chat: [],
        embedding: [],
        currentChat: 'gpt-4o',
        currentEmbedding: 'text-embedding-3-small',
      }),
    ).toBeNull();

    expect(
      applyAzureDeploymentLists({
        chat: ['gpt-4o', 'gpt-4o-mini'],
        embedding: ['text-embedding-3-small', 'text-embedding-3-large'],
        currentChat: 'gpt-4o-mini',
        currentEmbedding: 'custom-embed',
      }),
    ).toEqual({
      chatModel: 'gpt-4o-mini',
      embeddingModel: 'text-embedding-3-small',
      chatOptions: [
        { key: 'gpt-4o', label: 'gpt-4o' },
        { key: 'gpt-4o-mini', label: 'gpt-4o-mini' },
      ],
      embeddingOptions: [
        { key: 'text-embedding-3-small', label: 'text-embedding-3-small' },
        { key: 'text-embedding-3-large', label: 'text-embedding-3-large' },
      ],
      filledChat: true,
      filledEmbedding: true,
    });

    expect(
      applyAzureDeploymentLists({
        chat: ['gpt-4o'],
        embedding: [],
        currentChat: '',
        currentEmbedding: 'keep-me',
      }),
    ).toEqual({
      chatModel: 'gpt-4o',
      embeddingModel: 'keep-me',
      chatOptions: [{ key: 'gpt-4o', label: 'gpt-4o' }],
      embeddingOptions: [],
      filledChat: true,
      filledEmbedding: false,
    });
  });

  it('maps Azure deployment refresh failures to friendly i18n keys', () => {
    expect(formatAzureDeploymentsRefreshError('')).toBe('modelConfiguration.deployments.refresh.empty');
    expect(formatAzureDeploymentsRefreshError('API key is required to list Azure deployments')).toBe(
      'modelConfiguration.deployments.refresh.needCredentials',
    );
    expect(
      formatAzureDeploymentsRefreshError(
        'Azure rejected the API key while listing deployments (HTTP 401). Check that the key matches this endpoint.',
      ),
    ).toBe('modelConfiguration.deployments.refresh.invalidKey');
    expect(
      formatAzureDeploymentsRefreshError(
        'Azure does not allow listing deployments with an API key on this resource (common for Foundry / Cognitive Services).',
      ),
    ).toBe('modelConfiguration.deployments.refresh.unsupported');
    expect(
      formatAzureDeploymentsRefreshError('Could not reach Azure to list deployments (ConnectTimeout).'),
    ).toBe('modelConfiguration.deployments.refresh.unreachable');
    expect(formatAzureDeploymentsRefreshError('errors.network.noResponse')).toBe('errors.network.noResponse');

    const t = (key: string) => `t:${key}`;
    expect(resolveAzureDeploymentsRefreshMessage('API key is required', t)).toBe(
      't:modelConfiguration.deployments.refresh.needCredentials',
    );
  });

  it('dedupes Gemini catalog rows and keeps google_cloud off the Gemini key', () => {
    const mapped = mapModelConfigurationResponse({
      configured_count: 0,
      providers: [
        {
          provider: 'Google Gemini',
          value: 'gemini',
          kinds: ['chat', 'embedding'],
          config: { provider: 'gemini', configured: false },
        },
        {
          provider: 'Google Gemini',
          value: 'google_gemini',
          kinds: ['chat', 'embedding'],
          config: { provider: 'google_gemini', configured: false },
        },
        {
          provider: 'Google Cloud',
          value: 'google_cloud',
          kinds: ['chat'],
          config: { provider: 'google_cloud', configured: false },
        },
      ],
    });
    expect(mapped.providers.filter((p) => p.key === 'gemini')).toHaveLength(1);
    expect(mapped.providers.find((p) => p.key === 'gemini')?.label).toBe('Google Gemini');
    expect(mapped.providers.find((p) => p.key === 'google_cloud')?.label).toBe('Google Cloud');
  });

  it('requires an extra model for extra-only Test connection and sends it', () => {
    const ocr: ProviderCatalogEntry = {
      key: 'mistral_ocr',
      label: 'Mistral OCR',
      kinds: ['ocr'],
      adapter: 'openai_compatible',
      chatModels: [],
      embeddingModels: [],
      asrModels: [],
      ttsModels: [],
      rerankModels: [],
      ocrModels: [{ key: 'mistral-ocr-latest', label: 'mistral-ocr-latest' }],
      config: {
        provider: 'mistral_ocr',
        configured: false,
        hasApiKey: false,
        keyRejected: false,
        apiKeyMasked: '',
        chatModel: '',
        embeddingModel: '',
        asrModel: '',
        ttsModel: '',
        rerankModel: '',
        ocrModel: '',
        endpoint: '',
        apiVersion: '',
        surfaces: {
          chat: { temperature: null, similarityThreshold: null, maxTokens: null },
          search: { temperature: null, similarityThreshold: null, maxTokens: null },
        },
        lastTestStatus: null,
        lastTestedAt: null,
      },
    };
    const missing = buildProviderTestPayload({
      provider: 'mistral_ocr',
      draft: { ...buildProviderDraft(ocr), apiKey: TYPED_KEY },
      pendingPlaintextKey: TYPED_KEY,
      hasSavedKey: false,
      hasChat: false,
      adapter: 'openai_compatible',
    });
    expect(missing.error).toBe(TEST_NO_KIND_MODEL_ERROR);
    expect(missing.payload).toBeUndefined();

    const ready = buildProviderTestPayload({
      provider: 'mistral_ocr',
      draft: { ...buildProviderDraft(ocr), apiKey: TYPED_KEY, ocrModel: 'mistral-ocr-latest' },
      pendingPlaintextKey: TYPED_KEY,
      hasSavedKey: false,
      hasChat: false,
      adapter: 'openai_compatible',
    });
    expect(ready.error).toBeUndefined();
    expect(ready.payload).toMatchObject({
      chat_model: '',
      embedding_model: null,
      ocr_model: 'mistral-ocr-latest',
      api_key: TYPED_KEY,
    });
  });
});
