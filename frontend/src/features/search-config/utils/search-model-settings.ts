import { isMaskedApiKey, isSavedApiKeyMarker } from '@/features/search-config/utils/search-settings-api';

/** Reference Ollama placeholder key (SearchConfiguration.tsx). */
export const OLLAMA_PLACEHOLDER_API_KEY =
  'rag-suite_6f7jmIv8KzzTrpgxYSwyxDbz5GfWX5jp4YovLEHWJ4naao1R';

export function isOllamaProvider(provider: string | undefined | null): boolean {
  const normalized = provider?.toLowerCase().replace(/\s+/g, '-');
  return normalized === 'ollama' || normalized === 'custom-llm' || normalized === 'custom_llm';
}

export function isOllamaPlaceholderKey(apiKey: string | undefined | null): boolean {
  return apiKey?.trim() === OLLAMA_PLACEHOLDER_API_KEY;
}

export function resolveOllamaApiKeyDraft(current: string): string {
  if (!current.trim() || isOllamaPlaceholderKey(current)) {
    return OLLAMA_PLACEHOLDER_API_KEY;
  }
  return current;
}

export function parseConnectionTestResult(value?: string): { ok: boolean; detail: string } {
  if (!value) return { ok: true, detail: '' };
  if (value.startsWith('Success')) return { ok: true, detail: '' };
  if (value.startsWith('Skipped')) return { ok: true, detail: '' };
  return { ok: false, detail: value.replace(/^Failed:\s*/, '') };
}

export function formatConnectionTestError(raw: string): string {
  const text = raw.trim();
  if (!text) return 'Connection failed. Please try again.';

  const lower = text.toLowerCase();

  // Backend hosted-key gate — keep the full explanation (incl. Ollama needs no key).
  if (
    lower.includes('api key required') ||
    lower.includes('does not need an api key') ||
    lower.includes('fall back to a local ollama')
  ) {
    return text.replace(/^Failed:\s*/i, '');
  }

  if (
    lower.includes('status 401') ||
    lower.includes('401 unauthorized') ||
    lower.includes('"unauthorized"') ||
    lower.includes('incorrect api key') ||
    lower.includes('invalid api key') ||
    lower.includes('invalid_api_key') ||
    lower.includes('authentication_error')
  ) {
    return 'Invalid API key. Check that the key matches the selected provider.';
  }

  if (
    lower.includes('scoped to other chat models') ||
    lower.includes('no chat model access') ||
    lower.includes('select one of these in chat model')
  ) {
    return text.replace(/^Failed:\s*/i, '');
  }

  if (lower.includes('status 403') || lower.includes('403 forbidden')) {
    return 'Access denied. This API key may not have permission for the selected model.';
  }

  if (lower.includes('status 429') || lower.includes('rate limit') || lower.includes('too many requests')) {
    return 'Rate limit reached. Wait a moment and try again.';
  }

  if (lower.includes('timed out') || lower.includes('timeout')) {
    return (
      'Connection timed out while testing the provider. The API key may still be valid — try again, or check network/provider status.'
    );
  }

  if (lower.includes('status 503') || lower.includes('service unavailable')) {
    return 'The provider is temporarily unavailable. Try again in a few minutes.';
  }

  if (text.length > 120) {
    return 'Connection failed. Please verify your API key and model settings.';
  }

  return text.replace(/^Failed:\s*/i, '');
}

export function validateMaxTokensForResponseType(
  maxTokens: number | null | undefined,
  responseType: 'long' | 'short',
): string | null {
  if (maxTokens == null || maxTokens === 0) return null;
  if (responseType === 'long' && maxTokens < 400) {
    return `maxTokens for LONG response must be at least 400. You provided ${maxTokens}.`;
  }
  if (responseType === 'short' && maxTokens < 200) {
    return `maxTokens for SHORT response must be at least 200. You provided ${maxTokens}.`;
  }
  return null;
}

export type ApiKeyPersistInput = {
  draftKey: string;
  pendingPlaintextKey?: string | null;
  hasSavedKey: boolean;
  provider: string;
  apiKeyEditing?: boolean;
};

/** Resolve which plaintext API key to persist (pending typed key wins over masked display). */
export function resolveApiKeyForPersist(
  input: ApiKeyPersistInput,
): { apiKeyToSave?: string; error?: string } {
  const pending = (input.pendingPlaintextKey ?? '').trim();
  if (pending && !isMaskedApiKey(pending)) {
    return resolveApiKeyForModelSave(pending, input.hasSavedKey, input.provider);
  }

  const fromDraft = resolveApiKeyForModelSave(input.draftKey, input.hasSavedKey, input.provider);
  if (fromDraft.apiKeyToSave || fromDraft.error) {
    return fromDraft;
  }

  if (input.apiKeyEditing && !isOllamaProvider(input.provider)) {
    return {
      error:
        'Your API key was not saved. Click the API key field, enter your new key, then save again.',
    };
  }

  return {};
}

export type ApiKeyConnectionTestInput = {
  draftKey: string;
  pendingPlaintextKey?: string | null;
};

/** Pick the API key to send to /test (typed plaintext beats masked saved display). */
export function resolveApiKeyForConnectionTest(input: ApiKeyConnectionTestInput): {
  apiKey: string;
  useStored: boolean;
} {
  const pending = (input.pendingPlaintextKey ?? '').trim();
  if (pending && !isMaskedApiKey(pending)) {
    return { apiKey: pending, useStored: false };
  }

  const trimmed = input.draftKey.trim();
  if (trimmed && !isMaskedApiKey(trimmed)) {
    return { apiKey: trimmed, useStored: false };
  }

  return { apiKey: '', useStored: shouldUseStoredKeyForConnectionTest(input.draftKey) };
}

export function resolveApiKeyForModelSave(
  apiKey: string,
  hasSavedKey: boolean,
  provider: string,
): { apiKeyToSave?: string; error?: string } {
  if (isOllamaProvider(provider)) {
    const trimmed = apiKey.trim();
    if (!trimmed || isOllamaPlaceholderKey(trimmed)) {
      return { apiKeyToSave: OLLAMA_PLACEHOLDER_API_KEY };
    }
    if (!isMaskedApiKey(trimmed)) {
      return { apiKeyToSave: trimmed };
    }
    return {};
  }

  const trimmed = apiKey.trim();
  if (!trimmed && !hasSavedKey) {
    return { error: 'API key is required for this provider.' };
  }
  if (trimmed && !isMaskedApiKey(trimmed)) {
    if (trimmed.length < 20) {
      return { error: 'API key must be at least 20 characters.' };
    }
    if (!/^[a-zA-Z0-9\-_.]+$/.test(trimmed)) {
      return { error: 'API key contains invalid characters.' };
    }
    return { apiKeyToSave: trimmed };
  }
  return {};
}

export function resolveEmbeddingModelForSave(
  embeddingModel: string,
  availableKeys: string[],
): string {
  if (availableKeys.length === 0) return '';
  if (embeddingModel && availableKeys.includes(embeddingModel)) return embeddingModel;
  return availableKeys[0] ?? '';
}

export function shouldUseStoredKeyForConnectionTest(apiKey: string): boolean {
  const trimmed = apiKey.trim();
  return !trimmed || isMaskedApiKey(trimmed);
}

export type ConnectionTestProbeResults = {
  chat_model?: string;
  embedding_model?: string;
};

/** Format backend /test probe results; surfaces split chat vs embed failures. */
export function formatSplitConnectionTestResult(
  data: ConnectionTestProbeResults,
  options?: { embeddingModel?: string },
): { ok: boolean; message: string } {
  const chat = parseConnectionTestResult(data.chat_model);
  const embed = parseConnectionTestResult(data.embedding_model);
  const hasEmbedProbe = Boolean(options?.embeddingModel && data.embedding_model);

  if (!chat.ok && hasEmbedProbe && embed.ok) {
    return {
      ok: false,
      message: `Chat model: ${formatConnectionTestError(chat.detail)} Embedding model: connection OK.`,
    };
  }

  if (!chat.ok) {
    return { ok: false, message: formatConnectionTestError(chat.detail) };
  }

  if (hasEmbedProbe && !embed.ok) {
    return { ok: false, message: formatConnectionTestError(embed.detail) };
  }

  return { ok: true, message: 'Connection successful.' };
}

/**
 * True when a masked saved key exists and belongs to the same provider as the draft.
 * Prevents "API key saved" / reuse of an Ollama placeholder after switching to Gemini/etc.
 */
export function hasUsableSavedApiKeyForProvider(args: {
  apiKeyMasked: string | null | undefined;
  savedProvider: string | null | undefined;
  draftProvider: string | null | undefined;
  providerApiKeys?: Record<string, string> | null;
}): boolean {
  const draft = normalizeProviderFamily(args.draftProvider);
  if (args.providerApiKeys && draft) {
    const fromMap =
      args.providerApiKeys[draft]?.trim() ||
      Object.entries(args.providerApiKeys).find(
        ([key, value]) => normalizeProviderFamily(key) === draft && value?.trim(),
      )?.[1];
    if (fromMap?.trim()) return true;
  }
  if (!isSavedApiKeyMarker(args.apiKeyMasked) && !isMaskedApiKey(args.apiKeyMasked ?? '')) {
    return false;
  }
  const saved = normalizeProviderFamily(args.savedProvider);
  if (!saved || !draft) return false;
  return saved === draft;
}

function normalizeProviderFamily(provider: string | null | undefined): string {
  const key = (provider || '').toLowerCase().replace(/\s+/g, '-');
  if (!key) return '';
  if (key.includes('google') || key.includes('gemini')) return 'gemini';
  if (key.includes('mistral')) return 'mistral';
  if (key.includes('anthropic') || key.includes('claude')) return 'anthropic';
  if (key.includes('openai')) return 'openai';
  if (key.includes('ollama') || key.includes('custom')) return 'ollama';
  return key;
}
