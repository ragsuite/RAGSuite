import { isMaskedApiKey } from '@/features/search-config/utils/search-settings-api';

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

  if (lower.includes('status 403') || lower.includes('403 forbidden')) {
    return 'Access denied. This API key may not have permission for the selected model.';
  }

  if (lower.includes('status 429') || lower.includes('rate limit') || lower.includes('too many requests')) {
    return 'Rate limit reached. Wait a moment and try again.';
  }

  if (lower.includes('timed out') || lower.includes('timeout')) {
    return 'Connection timed out. Check your network and try again.';
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
