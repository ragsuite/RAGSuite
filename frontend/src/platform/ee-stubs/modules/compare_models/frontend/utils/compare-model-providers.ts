import type { CompareModelProvider } from '@/features/compare-models/types/compare-models.types';

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  mistral: 'Mistral',
  gemini: 'Google Gemini',
  'google-gemini': 'Google Gemini',
  ollama: 'Ollama',
  customllm: 'Custom LLM',
  'custom-llm': 'Custom LLM',
};

function normalizeProvider(provider: string | null | undefined): string {
  return String(provider ?? '').trim().toLowerCase();
}

export function providerLabelFromApi(provider: string | null | undefined): string {
  const key = normalizeProvider(provider);
  return PROVIDER_LABELS[key] ?? String(provider ?? '');
}

export function mapProviderFromApi(provider: string | null | undefined): CompareModelProvider {
  const key = normalizeProvider(provider);
  if (key === 'mistral' || key === 'ollama' || key === 'openai' || key === 'anthropic') return key;
  if (key === 'gemini' || key === 'google-gemini' || key === 'google') return 'google-gemini';
  return 'custom-llm';
}

/** Provider keys enabled for this compare session; `undefined` = let the server use all. */
export function enabledProviderKeys(
  configs: ReadonlyArray<{ providerKey?: string; enabled: boolean }>,
): string[] | undefined {
  const keyed = configs.filter((c) => c.providerKey);
  if (keyed.length === 0) return undefined;
  return keyed.filter((c) => c.enabled).map((c) => c.providerKey as string);
}
