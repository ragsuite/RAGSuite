import type { EmbeddingStatus } from '@/features/search-config/types/embedding.types';

const HOSTED_PROVIDERS = new Set(['openai', 'mistral', 'gemini']);

export function embeddingStatusSavedProvider(status: EmbeddingStatus): string {
  return (status.saved_provider || '').trim().toLowerCase();
}

/** Hosted providers need an API key; Ollama/local does not. */
export function embeddingStatusShowsApiKeyHints(status: EmbeddingStatus): boolean {
  return HOSTED_PROVIDERS.has(embeddingStatusSavedProvider(status));
}

/** Runtime active model differs from saved selection (usually Jina fallback). */
export function embeddingStatusShowsFallbackMismatch(status: EmbeddingStatus): boolean {
  if (status.fallback_used) return true;
  const saved = (status.saved_model || '').trim();
  const active = (status.active_model || '').trim();
  return Boolean(saved && active && saved !== active);
}
