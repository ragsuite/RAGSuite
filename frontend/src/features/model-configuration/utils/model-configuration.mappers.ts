import type {
  ModelConfigurationBundle,
  ModelConfigurationResponse,
  ModelOption,
  ModelProviderKey,
  ProviderCatalogEntry,
  ProviderCatalogResponse,
  ProviderConfig,
  ProviderConfigResponse,
  ProviderConfigSavePayload,
  ProviderDraft,
  ProviderTestPayload,
  ProviderTestStatus,
} from '@/features/model-configuration/types/model-configuration.types';
import {
  buildSurfaceTuningDrafts,
  buildSurfaceTuningPayload,
  mapSurfaceTuning,
} from '@/features/model-configuration/utils/provider-surface-tuning';
import { ensureModelOptionPresent } from '@/features/search-config/utils/model-settings-options';
import {
  isOllamaProvider,
  resolveApiKeyForPersist,
  resolveApiKeyForConnectionTest,
} from '@/features/search-config/utils/search-model-settings';
import { formatApiKeyFieldDisplay } from '@/features/search-config/utils/search-settings-api';

export const MODEL_PROVIDER_ORDER: ModelProviderKey[] = ['openai', 'anthropic', 'mistral', 'gemini', 'ollama'];

/** Chat-only providers have no embedding catalog. */
export const CHAT_ONLY_PROVIDERS: ReadonlySet<ModelProviderKey> = new Set(['anthropic']);

/** i18n key; other save errors come back as plain text from the shared key validators. */
export const CHAT_MODEL_REQUIRED_ERROR = 'modelConfiguration.errors.chatModelRequired';

export function toModelProviderKey(raw: string | null | undefined): ModelProviderKey | null {
  const key = (raw ?? '').trim().toLowerCase();
  if (key.includes('gemini') || key.includes('google')) return 'gemini';
  if (key.includes('ollama') || key.includes('custom')) return 'ollama';
  return MODEL_PROVIDER_ORDER.find((p) => p === key) ?? null;
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
    providers.push({
      key,
      label: entry.provider || key,
      chatModels: mapModelOptions(entry.chat_models),
      embeddingModels: CHAT_ONLY_PROVIDERS.has(key) ? [] : mapModelOptions(entry.embedding_models),
      config: mapProviderConfig(entry.config, key),
    });
  }
  providers.sort((a, b) => MODEL_PROVIDER_ORDER.indexOf(a.key) - MODEL_PROVIDER_ORDER.indexOf(b.key));
  return {
    providers,
    configuredCount: raw?.configured_count ?? providers.filter((p) => p.config.configured).length,
  };
}

export function resolveChatModelOptions(entry: ProviderCatalogEntry, selected: string): ModelOption[] {
  return ensureModelOptionPresent(entry.chatModels, selected);
}

export function resolveEmbeddingOptions(entry: ProviderCatalogEntry, selected: string): ModelOption[] {
  if (CHAT_ONLY_PROVIDERS.has(entry.key)) return [];
  return ensureModelOptionPresent(entry.embeddingModels, selected);
}

export function buildProviderDraft(entry: ProviderCatalogEntry): ProviderDraft {
  const { config } = entry;
  return {
    chatModel: config.chatModel || entry.chatModels[0]?.key || '',
    embeddingModel: CHAT_ONLY_PROVIDERS.has(entry.key)
      ? ''
      : config.embeddingModel || entry.embeddingModels[0]?.key || '',
    apiKey: config.hasApiKey ? formatApiKeyFieldDisplay(config.apiKeyMasked) : '',
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
}): { payload?: ProviderConfigSavePayload; error?: string } {
  const { provider, draft } = input;
  const payload: ProviderConfigSavePayload = {
    chat_model: draft.chatModel,
    embedding_model: CHAT_ONLY_PROVIDERS.has(provider) ? null : draft.embeddingModel || null,
    ...buildSurfaceTuningPayload(provider, draft.surfaces),
  };
  if (!draft.chatModel.trim()) return { error: CHAT_MODEL_REQUIRED_ERROR };
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

export function buildProviderTestPayload(
  provider: ModelProviderKey,
  draft: ProviderDraft,
  pendingPlaintextKey: string,
): ProviderTestPayload {
  const { apiKey } = resolveApiKeyForConnectionTest({ draftKey: draft.apiKey, pendingPlaintextKey });
  const payload: ProviderTestPayload = {
    chat_model: draft.chatModel,
    embedding_model: CHAT_ONLY_PROVIDERS.has(provider) ? null : draft.embeddingModel || null,
  };
  if (apiKey) payload.api_key = apiKey;
  return payload;
}
