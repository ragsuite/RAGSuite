import type { ModelProvider } from '@/features/search-config/types/search-config.types';
import type { AvailableSearchModels } from '@/features/search-config/types/search-config.types';

export const MODEL_PROVIDER_OPTIONS: { key: ModelProvider; label: string }[] = [
  { key: 'openai', label: 'OpenAI' },
  { key: 'anthropic', label: 'Anthropic' },
  { key: 'mistral', label: 'Mistral' },
  { key: 'google-gemini', label: 'Google Gemini' },
  { key: 'ollama', label: 'Custom LLM / Ollama' },
];

const CHAT_MODELS_BY_PROVIDER: Record<ModelProvider, { key: string; label: string }[]> = {
  openai: [
    { key: 'gpt-4', label: 'GPT-4' },
    { key: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    { key: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
    { key: 'gpt-4o', label: 'GPT-4o' },
    { key: 'gpt-4o-mini', label: 'GPT-4o-mini' },
    { key: 'gpt-5.4', label: 'GPT-5.4' },
    { key: 'gpt-5.4-pro', label: 'GPT-5.4 Pro' },
    { key: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
    { key: 'gpt-5.4-nano', label: 'GPT-5.4 Nano' },
    { key: 'gpt-4.1-mini', label: 'gpt-4.1-mini' },
  ],
  anthropic: [
    { key: 'claude-3-opus', label: 'Claude 3 Opus' },
    { key: 'claude-3-sonnet', label: 'Claude 3 Sonnet' },
    { key: 'claude-3-haiku', label: 'Claude 3 Haiku' },
    { key: 'claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
  ],
  mistral: [
    { key: 'mistral-small-latest', label: 'Mistral Small' },
    { key: 'ministral-8b-latest', label: 'Ministral 8B' },
    { key: 'mistral-medium-latest', label: 'Mistral Medium' },
    { key: 'mistral-large-latest', label: 'Mistral Large' },
    { key: 'open-mistral-nemo', label: 'Open Mistral Nemo' },
    { key: 'mistral-large', label: 'Mistral Large (legacy)' },
    { key: 'mistral-medium', label: 'Mistral Medium (legacy)' },
    { key: 'mistral-small', label: 'Mistral Small (legacy)' },
  ],
  'google-gemini': [
    { key: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
    { key: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
    { key: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  ],
  'custom-llm': [
    { key: 'default', label: 'Custom Model (Default)' },
    { key: 'llama3:8b', label: 'Llama 3 8B' },
    { key: 'mistral', label: 'Mistral' },
    { key: 'gemma2', label: 'Gemma 2' },
    { key: 'gemma3:27b-cloud', label: 'Gemma 3 27B Cloud' },
    { key: 'gemma4:31b-cloud', label: 'Gemma 4 31B Cloud' },
  ],
  ollama: [
    { key: 'default', label: 'Custom Model (Default)' },
    { key: 'llama3:8b', label: 'Llama 3 8B' },
    { key: 'mistral', label: 'Mistral' },
    { key: 'gemma2', label: 'Gemma 2' },
    { key: 'gemma3:27b-cloud', label: 'Gemma 3 27B Cloud' },
    { key: 'gemma4:31b-cloud', label: 'Gemma 4 31B Cloud' },
  ],
};

export const EMBEDDING_MODEL_OPTIONS = [
  { key: 'jina/jina-embeddings-v2-base-de', label: 'Jina v2 Base DE' },
  { key: 'jina/jina-embeddings-v2-base-en', label: 'Jina v2 Base EN' },
  { key: 'mistral-embed', label: 'mistral-embed' },
  { key: 'text-embedding-3-large', label: 'text-embedding-3-large' },
  { key: 'text-embedding-3-small', label: 'text-embedding-3-small' },
  { key: 'text-embedding-ada-002', label: 'text-embedding-ada-002' },
];

export function getChatModelsForProvider(provider: ModelProvider) {
  return CHAT_MODELS_BY_PROVIDER[provider] ?? CHAT_MODELS_BY_PROVIDER.openai;
}

export function paramFieldLabel(title: string, key: string, type: string) {
  return `${title} (${key} [${type}])`;
}

export function formatModelProviderLabel(provider: ModelProvider | string): string {
  const normalized = String(provider).toLowerCase();
  if (normalized === 'ollama' || normalized === 'custom-llm' || normalized === 'custom_llm') {
    return 'Custom LLM / Ollama';
  }
  const match = MODEL_PROVIDER_OPTIONS.find((p) => p.key === normalized);
  if (match) return match.label;
  const trimmed = String(provider).trim();
  if (!trimmed) return 'Not set';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function normalizeModelProviderKey(provider: string | null | undefined): ModelProvider {
  const normalized = String(provider ?? 'openai')
    .toLowerCase()
    .replace(/\s+/g, '-');
  if (normalized === 'custom-llm' || normalized === 'custom_llm') return 'ollama';
  return normalized as ModelProvider;
}

export function resolveProviderOptions(available: AvailableSearchModels | null | undefined) {
  if (available?.providers?.length) {
    return available.providers.map((p) => ({
      key: normalizeModelProviderKey(p.key) as ModelProvider,
      label: p.label,
    }));
  }
  return MODEL_PROVIDER_OPTIONS;
}

export function resolveChatModelsForProvider(
  provider: ModelProvider | string,
  available: AvailableSearchModels | null | undefined,
) {
  const providerKey = normalizeModelProviderKey(String(provider));
  const fromApi =
    available?.chatModelsByProvider?.[providerKey] ??
    available?.chatModelsByProvider?.[String(provider).toLowerCase()];
  if (fromApi?.length) return fromApi;
  return getChatModelsForProvider(providerKey);
}

export function resolveEmbeddingModelOptions(
  provider: ModelProvider | string,
  available: AvailableSearchModels | null | undefined,
) {
  const providerKey = normalizeModelProviderKey(String(provider));
  const fromApi =
    available?.embeddingModelsByProvider?.[providerKey] ??
    available?.embeddingModelsByProvider?.[String(provider).toLowerCase()];
  if (fromApi?.length) return fromApi;
  if (providerKey === 'ollama' || providerKey === 'openai') {
    return EMBEDDING_MODEL_OPTIONS.filter((m) => m.key.includes('jina'));
  }
  if (providerKey === 'mistral') {
    return EMBEDDING_MODEL_OPTIONS.filter((m) => m.key === 'mistral-embed');
  }
  return EMBEDDING_MODEL_OPTIONS;
}
