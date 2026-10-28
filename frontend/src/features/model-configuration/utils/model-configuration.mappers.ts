import type {
  AzureDeploymentsListResult,
  ModelConfigurationBundle,
  ModelConfigurationResponse,
  ModelOption,
  ModelProviderKey,
  NativeModelProviderKey,
  ProviderAdapter,
  ProviderCatalogEntry,
  ProviderCatalogResponse,
  ProviderConfig,
  ProviderConfigResponse,
  ProviderConfigSavePayload,
  ProviderDraft,
  ProviderKind,
  ProviderTestPayload,
  ProviderTestStatus,
} from '@/features/model-configuration/types/model-configuration.types';
import { PROVIDER_KINDS } from '@/features/model-configuration/types/model-configuration.types';
import {
  buildSurfaceTuningDrafts,
  buildSurfaceTuningPayload,
  mapSurfaceTuning,
} from '@/features/model-configuration/utils/provider-surface-tuning';
import {
  ensureModelOptionPresent,
  formatModelProviderLabel,
} from '@/features/search-config/utils/model-settings-options';
import {
  isOllamaProvider,
  resolveApiKeyForPersist,
  resolveApiKeyForConnectionTest,
} from '@/features/search-config/utils/search-model-settings';
import { formatApiKeyFieldDisplay } from '@/features/search-config/utils/search-settings-api';

export const MODEL_PROVIDER_ORDER: NativeModelProviderKey[] = [
  'openai',
  'azure_openai',
  'anthropic',
  'mistral',
  'gemini',
  'ollama',
];

/** Chat-only providers have no embedding catalog. */
export const CHAT_ONLY_PROVIDERS: ReadonlySet<ModelProviderKey> = new Set(['anthropic']);

/** Providers that require a resource endpoint URL. */
export const ENDPOINT_REQUIRED_PROVIDERS: ReadonlySet<ModelProviderKey> = new Set(['azure_openai']);

/** i18n key; other save errors come back as plain text from the shared key validators. */
export const CHAT_MODEL_REQUIRED_ERROR = 'modelConfiguration.errors.chatModelRequired';
export const ENDPOINT_REQUIRED_ERROR = 'modelConfiguration.errors.endpointRequired';
export const TEST_NO_KEY_ERROR = 'models.apiKey.test.noKey';
export const TEST_NO_MODEL_ERROR = 'models.apiKey.test.noModel';
export const TEST_NO_KIND_MODEL_ERROR = 'modelConfiguration.errors.testModelRequired';
/** Azure: both endpoint and API key blank when Test connection is pressed. */
export const TEST_CREDENTIALS_REQUIRED_ERROR = 'modelConfiguration.errors.testCredentialsRequired';

export function toModelProviderKey(raw: string | null | undefined): ModelProviderKey | null {
  const key = (raw ?? '').trim().toLowerCase();
  if (!key) return null;
  if (key === 'openai_compatible' || key.startsWith('openai_compatible')) {
    const rest = key.includes(':') ? key.split(':')[1] : key.replace(/^openai_compatible_?/, '');
    return rest || 'openai_compatible';
  }
  if (key === 'gemini' || key === 'google_gemini' || key === 'google-gemini' || key.includes('gemini')) {
    return 'gemini';
  }
  if (key.includes('ollama') || key.includes('custom')) return 'ollama';
  // Azure before any openai substring match.
  if (key === 'azure_openai' || key.includes('azure_openai') || key.startsWith('azure')) {
    return 'azure_openai';
  }
  return MODEL_PROVIDER_ORDER.find((p) => p === key) ?? key;
}

export function isChatOnlyProvider(entry: Pick<ProviderCatalogEntry, 'key' | 'kinds'>): boolean {
  if (CHAT_ONLY_PROVIDERS.has(entry.key)) return true;
  return Array.isArray(entry.kinds) && entry.kinds.includes('chat') && !entry.kinds.includes('embedding');
}

/** Egress banner / legacy model-settings helpers use `google-gemini`. */
export function toLegacyProviderKey(provider: ModelProviderKey): string {
  return provider === 'gemini' ? 'google-gemini' : provider;
}

function mapModelOptions(raw: ProviderCatalogResponse['chat_models']): ModelOption[] {
  return (raw ?? [])
    .map((m) => ({ key: String(m.value ?? m.name ?? '').trim(), label: String(m.name ?? m.value ?? '').trim() }))
    .filter((m) => m.key);
}

function toTestStatus(raw: string | null | undefined): ProviderTestStatus {
  return raw === 'success' || raw === 'failed' ? raw : null;
}

export function mapProviderConfig(raw: ProviderConfigResponse | undefined, provider: ModelProviderKey): ProviderConfig {
  return {
    provider,
    configured: Boolean(raw?.configured),
    hasApiKey: Boolean(raw?.has_api_key),
    keyRejected: Boolean(raw?.key_rejected),
    apiKeyMasked: raw?.api_key_masked?.trim() ?? '',
    chatModel: raw?.chat_model?.trim() ?? '',
    embeddingModel: raw?.embedding_model?.trim() ?? '',
    asrModel: raw?.asr_model?.trim() ?? '',
    ttsModel: raw?.tts_model?.trim() ?? '',
    rerankModel: raw?.rerank_model?.trim() ?? '',
    ocrModel: raw?.ocr_model?.trim() ?? '',
    endpoint: raw?.endpoint?.trim() ?? '',
    apiVersion: raw?.api_version?.trim() ?? '',
    surfaces: mapSurfaceTuning(raw),
    lastTestStatus: toTestStatus(raw?.last_test_status),
    lastTestedAt: raw?.last_tested_at ?? null,
  };
}

export function mapModelConfigurationResponse(raw: ModelConfigurationResponse | null | undefined): ModelConfigurationBundle {
  const providers: ProviderCatalogEntry[] = [];
  for (const entry of raw?.providers ?? []) {
    const key = toModelProviderKey(entry.value);
    if (!key) continue;
    const adapter: ProviderAdapter = entry.adapter === 'openai_compatible' ? 'openai_compatible' : 'native';
    const kinds: ProviderKind[] =
      Array.isArray(entry.kinds) && entry.kinds.length > 0
        ? entry.kinds.filter((kind): kind is ProviderKind => (PROVIDER_KINDS as readonly string[]).includes(kind))
        : key === 'anthropic'
          ? ['chat']
          : ['chat', 'embedding'];
    if (providers.some((existing) => existing.key === key)) continue;
    const mapped: ProviderCatalogEntry = {
      key,
      label: entry.provider?.trim() || formatModelProviderLabel(key),
      adapter,
      kinds,
      defaultBaseUrl: entry.default_base_url,
      docsUrl: entry.docs_url,
      chatModels: mapModelOptions(entry.chat_models),
      embeddingModels: kinds.includes('embedding') ? mapModelOptions(entry.embedding_models) : [],
      asrModels: kinds.includes('asr') ? mapModelOptions(entry.asr_models) : [],
      ttsModels: kinds.includes('tts') ? mapModelOptions(entry.tts_models) : [],
      rerankModels: kinds.includes('rerank') ? mapModelOptions(entry.rerank_models) : [],
      ocrModels: kinds.includes('ocr') ? mapModelOptions(entry.ocr_models) : [],
      config: mapProviderConfig(entry.config, key),
    };
    providers.push(mapped);
  }
  providers.sort((a, b) => {
    if (a.config.configured !== b.config.configured) return a.config.configured ? -1 : 1;
    const ai = MODEL_PROVIDER_ORDER.indexOf(a.key as NativeModelProviderKey);
    const bi = MODEL_PROVIDER_ORDER.indexOf(b.key as NativeModelProviderKey);
    const aNative = ai >= 0;
    const bNative = bi >= 0;
    if (aNative && bNative) return ai - bi;
    if (aNative) return -1;
    if (bNative) return 1;
    return a.label.localeCompare(b.label);
  });
  return {
    providers,
    configuredCount: raw?.configured_count ?? providers.filter((p) => p.config.configured).length,
  };
}

export function resolveChatModelOptions(entry: ProviderCatalogEntry, selected: string): ModelOption[] {
  return ensureModelOptionPresent(entry.chatModels, selected);
}

export function resolveEmbeddingOptions(entry: ProviderCatalogEntry, selected: string): ModelOption[] {
  if (isChatOnlyProvider(entry)) return [];
  return ensureModelOptionPresent(entry.embeddingModels, selected);
}

export function buildProviderDraft(entry: ProviderCatalogEntry): ProviderDraft {
  const { config } = entry;
  const isAzure = entry.key === 'azure_openai';
  return {
    // Azure: do not auto-pick a curated OpenAI id — deployment names are free-text / live-listed.
    chatModel: config.chatModel || (isAzure ? '' : entry.chatModels[0]?.key || ''),
    embeddingModel: isChatOnlyProvider(entry)
      ? ''
      : config.embeddingModel || (isAzure ? '' : entry.embeddingModels[0]?.key || ''),
    asrModel: config.asrModel || '',
    ttsModel: config.ttsModel || '',
    rerankModel: config.rerankModel || '',
    ocrModel: config.ocrModel || '',
    apiKey: config.hasApiKey ? formatApiKeyFieldDisplay(config.apiKeyMasked) : '',
    endpoint: config.endpoint || '',
    apiVersion: config.apiVersion || '',
    surfaces: buildSurfaceTuningDrafts(entry.key, config.surfaces),
  };
}

/** Build the save body; an omitted `api_key` keeps the stored key server-side. */
export function buildProviderSavePayload(input: {
  provider: ModelProviderKey;
  draft: ProviderDraft;
  pendingPlaintextKey: string;
  hasSavedKey: boolean;
  apiKeyEditing: boolean;
  chatOnly?: boolean;
  hasChat?: boolean;
  adapter?: ProviderAdapter;
}): { payload?: ProviderConfigSavePayload; error?: string } {
  const { provider, draft } = input;
  const chatOnly = input.chatOnly === true || CHAT_ONLY_PROVIDERS.has(provider);
  const hasChat = input.hasChat !== false;
  const payload: ProviderConfigSavePayload = {
    chat_model: draft.chatModel,
    embedding_model: chatOnly ? null : draft.embeddingModel || null,
    asr_model: draft.asrModel.trim() || null,
    tts_model: draft.ttsModel.trim() || null,
    rerank_model: draft.rerankModel.trim() || null,
    ocr_model: draft.ocrModel.trim() || null,
    ...buildSurfaceTuningPayload(provider, draft.surfaces),
  };
  if (hasChat && !draft.chatModel.trim()) return { error: CHAT_MODEL_REQUIRED_ERROR };
  if (ENDPOINT_REQUIRED_PROVIDERS.has(provider)) {
    const endpoint = draft.endpoint.trim().replace(/\/+$/, '');
    if (!endpoint) return { error: ENDPOINT_REQUIRED_ERROR };
    payload.endpoint = endpoint;
    // Always send (may be "") so an emptied field clears a stored override.
    payload.api_version = draft.apiVersion.trim();
  } else if (input.adapter === 'openai_compatible') {
    const endpoint = draft.endpoint.trim().replace(/\/+$/, '');
    if (endpoint) payload.endpoint = endpoint;
  }
  if (isOllamaProvider(provider)) return { payload };

  const { apiKeyToSave, error } = resolveApiKeyForPersist({
    draftKey: draft.apiKey,
    pendingPlaintextKey: input.pendingPlaintextKey,
    hasSavedKey: input.hasSavedKey,
    provider,
    apiKeyEditing: input.apiKeyEditing,
  });
  if (error) return { error };
  if (apiKeyToSave) payload.api_key = apiKeyToSave;
  return { payload };
}

/**
 * Build the /test body after client preflight checks (no network call on validation failure).
 * Order matches Azure fields above Test connection: endpoint → API key → chat model.
 */
export function buildProviderTestPayload(input: {
  provider: ModelProviderKey;
  draft: ProviderDraft;
  pendingPlaintextKey: string;
  hasSavedKey: boolean;
  chatOnly?: boolean;
  hasChat?: boolean;
  adapter?: ProviderAdapter;
}): { payload?: ProviderTestPayload; error?: string } {
  const { provider, draft, pendingPlaintextKey, hasSavedKey } = input;
  const chatOnly = input.chatOnly === true || CHAT_ONLY_PROVIDERS.has(provider);
  const { apiKey, useStored } = resolveApiKeyForConnectionTest({
    draftKey: draft.apiKey,
    pendingPlaintextKey,
  });
  const hasUsableKey = Boolean(apiKey) || (useStored && hasSavedKey);

  if (ENDPOINT_REQUIRED_PROVIDERS.has(provider)) {
    const endpointBlank = !draft.endpoint.trim();
    const keyMissing = !hasUsableKey;
    if (endpointBlank && keyMissing) return { error: TEST_CREDENTIALS_REQUIRED_ERROR };
    if (endpointBlank) return { error: ENDPOINT_REQUIRED_ERROR };
    if (keyMissing) return { error: TEST_NO_KEY_ERROR };
  } else if (!isOllamaProvider(provider) && !hasUsableKey) {
    return { error: TEST_NO_KEY_ERROR };
  }

  const hasChat = input.hasChat !== false;
  const extraModels = {
    asr_model: draft.asrModel.trim() || null,
    tts_model: draft.ttsModel.trim() || null,
    rerank_model: draft.rerankModel.trim() || null,
    ocr_model: draft.ocrModel.trim() || null,
  };
  const hasExtra = Object.values(extraModels).some(Boolean);
  const hasEmbedding = !chatOnly && Boolean(draft.embeddingModel.trim());
  if (hasChat && !draft.chatModel.trim()) return { error: TEST_NO_MODEL_ERROR };
  if (!hasChat && !hasEmbedding && !hasExtra) return { error: TEST_NO_KIND_MODEL_ERROR };

  const payload: ProviderTestPayload = {
    chat_model: draft.chatModel.trim(),
    embedding_model: chatOnly ? null : draft.embeddingModel.trim() || null,
    ...extraModels,
  };
  if (apiKey) payload.api_key = apiKey;
  if (ENDPOINT_REQUIRED_PROVIDERS.has(provider)) {
    payload.endpoint = draft.endpoint.trim().replace(/\/+$/, '');
    payload.api_version = draft.apiVersion.trim() || null;
  } else if (input.adapter === 'openai_compatible') {
    const endpoint = draft.endpoint.trim().replace(/\/+$/, '');
    if (endpoint) payload.endpoint = endpoint;
  }
  return { payload };
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

/** Normalize Azure deployments list API body. */
export function mapAzureDeploymentsListResult(raw: unknown): AzureDeploymentsListResult {
  const data =
    raw && typeof raw === 'object' && 'data' in raw && (raw as { data: unknown }).data != null
      ? (raw as { data: unknown }).data
      : raw;
  if (!data || typeof data !== 'object') {
    return { chat: [], embedding: [], error: null };
  }
  const row = data as Record<string, unknown>;
  const errorRaw = row.error;
  return {
    chat: asStringList(row.chat),
    embedding: asStringList(row.embedding),
    error: typeof errorRaw === 'string' && errorRaw.trim() ? errorRaw.trim() : null,
  };
}

function toDeploymentOptions(names: string[]): ModelOption[] {
  const seen = new Set<string>();
  const options: ModelOption[] = [];
  for (const raw of names) {
    const key = raw.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    options.push({ key, label: key });
  }
  return options;
}

/**
 * Policy C: keep current value when it exists in the Azure list; otherwise first discovered.
 * Returns null when both lists are empty (caller should toast).
 */
export function applyAzureDeploymentLists(input: {
  chat: string[];
  embedding: string[];
  currentChat: string;
  currentEmbedding: string;
}): {
  chatModel: string;
  embeddingModel: string;
  chatOptions: ModelOption[];
  embeddingOptions: ModelOption[];
  filledChat: boolean;
  filledEmbedding: boolean;
} | null {
  const chatOptions = toDeploymentOptions(input.chat);
  const embeddingOptions = toDeploymentOptions(input.embedding);
  if (chatOptions.length === 0 && embeddingOptions.length === 0) return null;

  const currentChat = input.currentChat.trim();
  const currentEmbedding = input.currentEmbedding.trim();
  const chatKeys = new Set(chatOptions.map((o) => o.key));
  const embeddingKeys = new Set(embeddingOptions.map((o) => o.key));

  const chatModel =
    chatOptions.length === 0
      ? currentChat
      : currentChat && chatKeys.has(currentChat)
        ? currentChat
        : chatOptions[0].key;

  const embeddingModel =
    embeddingOptions.length === 0
      ? currentEmbedding
      : currentEmbedding && embeddingKeys.has(currentEmbedding)
        ? currentEmbedding
        : embeddingOptions[0].key;

  return {
    chatModel,
    embeddingModel,
    chatOptions,
    embeddingOptions,
    filledChat: chatOptions.length > 0,
    filledEmbedding: embeddingOptions.length > 0,
  };
}

/**
 * Pick first discovered chat/embedding names for draft fields.
 * Returns null when neither list has a name (caller should toast).
 * @deprecated Prefer `applyAzureDeploymentLists` (policy C + select options).
 */
export function pickAzureDeploymentNames(result: AzureDeploymentsListResult): {
  chatModel?: string;
  embeddingModel?: string;
} | null {
  const applied = applyAzureDeploymentLists({
    chat: result.chat,
    embedding: result.embedding,
    currentChat: '',
    currentEmbedding: '',
  });
  if (!applied) return null;
  return {
    ...(applied.filledChat ? { chatModel: applied.chatModel } : {}),
    ...(applied.filledEmbedding ? { embeddingModel: applied.embeddingModel } : {}),
  };
}

/**
 * Map thrown / backend Azure listing messages to short, user-facing copy.
 * Returns an i18n key when possible; otherwise a cleaned plain sentence.
 */
export function formatAzureDeploymentsRefreshError(raw: string | null | undefined): string {
  const text = (raw ?? '').trim();
  if (!text) return 'modelConfiguration.deployments.refresh.empty';

  // Network layer may throw an i18n key directly.
  if (text === 'errors.network.noResponse' || text.startsWith('modelConfiguration.')) {
    return text;
  }

  const lower = text.toLowerCase();

  if (
    lower.includes('endpoint is required') ||
    (lower.includes('endpoint') && lower.includes('required') && lower.includes('api key'))
  ) {
    if (lower.includes('api key') && lower.includes('endpoint')) {
      return 'modelConfiguration.deployments.refresh.needCredentials';
    }
    return 'modelConfiguration.errors.endpointRequired';
  }

  if (
    lower.includes('api key is required') ||
    lower.includes('api key required') ||
    (lower.includes('api key') && lower.includes('required to list'))
  ) {
    return 'modelConfiguration.deployments.refresh.needCredentials';
  }

  if (
    lower.includes('rejected the api key') ||
    lower.includes('401') ||
    lower.includes('403') ||
    lower.includes('unauthorized') ||
    lower.includes('invalid api key') ||
    lower.includes('incorrect api key')
  ) {
    return 'modelConfiguration.deployments.refresh.invalidKey';
  }

  if (
    lower.includes('does not allow listing') ||
    lower.includes('foundry') ||
    lower.includes('cognitive services') ||
    (lower.includes('listing failed') && lower.includes('http'))
  ) {
    return 'modelConfiguration.deployments.refresh.unsupported';
  }

  if (
    lower.includes('could not reach') ||
    lower.includes('timed out') ||
    lower.includes('timeout') ||
    lower.includes('network')
  ) {
    return 'modelConfiguration.deployments.refresh.unreachable';
  }

  if (
    lower.includes('no deployments') ||
    lower.includes('no azure deployments') ||
    lower.includes('empty deployment')
  ) {
    return 'modelConfiguration.deployments.refresh.empty';
  }

  if (
    lower.includes('permission') ||
    lower.includes('forbidden') ||
    lower.includes('not allowed')
  ) {
    return 'modelConfiguration.deployments.refresh.failed';
  }

  // Prefer short backend sentences; otherwise fall back to a generic friendly line.
  if (text.length <= 160 && !text.includes('{') && !text.includes('Traceback')) {
    return text.replace(/^Failed:\s*/i, '');
  }
  return 'modelConfiguration.deployments.refresh.failed';
}

export function resolveAzureDeploymentsRefreshMessage(
  raw: string | null | undefined,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const formatted = formatAzureDeploymentsRefreshError(raw);
  if (formatted.startsWith('modelConfiguration.') || formatted.startsWith('errors.')) {
    return t(formatted);
  }
  return formatted;
}
